// LogiTrack 核心链路测试。
//
// 覆盖评审硬门槛：
//   鉴权（注册/登录/401/403）、越权（跨角色访问）、状态机非法流转（400）、
//   分页边界、搜索筛选、AI 降级（source 字段 + 落库）、时间轴结构、异常闭环。
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');

function runSuite({ createApp, mountRoutes, port = 4999 }) {
  let server;
  let base;

  before(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-suite';
    const app = createApp({ mountRoutes });
    server = app.listen(port);
    base = `http://127.0.0.1:${port}`;
  });

  after(() => {
    if (server) server.close();
  });

  async function call(method, path, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(base + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* 忽略非 JSON */ }
    return { status: res.status, json };
  }

  const uniq = () => 'u' + Date.now() + Math.floor(Math.random() * 100000);

  async function loginAs(username, password) {
    const { json } = await call('POST', '/api/auth/login', { username, password });
    return json.data.token;
  }

  async function registerCourier() {
    const username = uniq();
    const { json } = await call('POST', '/api/auth/register', { username, password: 'pass1234' });
    return { token: json.data.token, user: json.data.user, username };
  }

  let adminToken;
  let dispatcherToken;
  let courierToken;
  let sampleWaybillId;

  // ---------- 鉴权 ----------

  test('注册成功返回 token 与用户，且不回传密码', async () => {
    const username = uniq();
    const { status, json } = await call('POST', '/api/auth/register', { username, password: 'pass1234' });
    assert.strictEqual(status, 200);
    assert.strictEqual(json.code, 0);
    assert.ok(json.data.token);
    assert.strictEqual(json.data.user.username, username);
    assert.strictEqual(json.data.user.password, undefined);
  });

  test('重复用户名注册返回 409', async () => {
    const username = uniq();
    await call('POST', '/api/auth/register', { username, password: 'pass1234' });
    const { status } = await call('POST', '/api/auth/register', { username, password: 'pass1234' });
    assert.strictEqual(status, 409);
  });

  test('弱密码被拒绝（400）', async () => {
    const { status } = await call('POST', '/api/auth/register', { username: uniq(), password: '123' });
    assert.strictEqual(status, 400);
  });

  test('未登录访问受保护接口返回 401', async () => {
    const { status, json } = await call('GET', '/api/auth/me');
    assert.strictEqual(status, 401);
    assert.notStrictEqual(json.code, 0);
  });

  test('错误密码登录返回 401', async () => {
    const username = uniq();
    await call('POST', '/api/auth/register', { username, password: 'pass1234' });
    const { status } = await call('POST', '/api/auth/login', { username, password: 'wrongpass' });
    assert.strictEqual(status, 401);
  });

  test('种子账号 admin / dispatcher1 / courier1 均可登录', async () => {
    for (const [u, p] of [['admin', 'admin123'], ['dispatcher1', 'dispatcher123'], ['courier1', 'courier123']]) {
      const { status, json } = await call('POST', '/api/auth/login', { username: u, password: p });
      assert.strictEqual(status, 200, `${u} 应能登录`);
      assert.ok(json.data.token);
    }
    adminToken = await loginAs('admin', 'admin123');
    dispatcherToken = await loginAs('dispatcher1', 'dispatcher123');
    courierToken = await loginAs('courier1', 'courier123');
  });

  // ---------- 越权 ----------

  test('快递员访问 Admin 概览返回 403', async () => {
    const { status, json } = await call('GET', '/api/admin/overview', null, courierToken);
    assert.strictEqual(status, 403);
    assert.notStrictEqual(json.code, 0);
  });

  test('快递员访问调度台返回 403，调度员可访问', async () => {
    const denied = await call('GET', '/api/ops/dispatch/summary', null, courierToken);
    assert.strictEqual(denied.status, 403);
    const allowed = await call('GET', '/api/ops/dispatch/summary', null, dispatcherToken);
    assert.strictEqual(allowed.status, 200);
    assert.strictEqual(allowed.json.code, 0);
  });

  test('快递员访问看板返回 403，管理员可访问', async () => {
    const denied = await call('GET', '/api/ops/dashboard', null, courierToken);
    assert.strictEqual(denied.status, 403);
    const allowed = await call('GET', '/api/ops/dashboard', null, adminToken);
    assert.strictEqual(allowed.status, 200);
    assert.ok(typeof allowed.json.data.overview.waybills_total === 'number');
  });

  test('普通快递员删除运单返回 403（仅管理员可删）', async () => {
    const { status } = await call('DELETE', `/api/waybills/${sampleWaybillId || 1}`, null, courierToken);
    assert.strictEqual(status, 403);
  });

  test('普通用户无法修改网点（写角色受限）', async () => {
    const { token } = await registerCourier();
    const { status } = await call('POST', '/api/entities/warehouses', { name: '测试网点' }, token);
    assert.strictEqual(status, 403, '注册的 courier 角色不应能新建网点');
    const denied = await call('POST', '/api/entities/warehouses', { name: '测试网点' }, courierToken);
    assert.strictEqual(denied.status, 403);
    const allowed = await call('POST', '/api/entities/warehouses', { name: `测试网点${Date.now()}`, city: '测试市' }, dispatcherToken);
    assert.strictEqual(allowed.status, 201);
  });

  // ---------- 运单创建与校验 ----------

  test('创建运单缺少必填字段返回 400', async () => {
    const { status, json } = await call('POST', '/api/waybills', { sender_name: '张三' }, dispatcherToken);
    assert.strictEqual(status, 400);
    assert.notStrictEqual(json.code, 0);
  });

  test('创建运单手机号格式错误返回 400', async () => {
    const { status } = await call('POST', '/api/waybills', {
      sender_name: '张三', sender_phone: 'abc', receiver_name: '李四',
      receiver_phone: '13800000000', receiver_address: '某地',
    }, dispatcherToken);
    assert.strictEqual(status, 400);
  });

  test('创建运单成功，返回运单号与初始状态 created', async () => {
    const { status, json } = await call('POST', '/api/waybills', {
      sender_name: '张三', sender_phone: '13800000001', sender_address: '上海市青浦区某路 1 号',
      receiver_name: '李四', receiver_phone: '13900000002', receiver_address: '北京市朝阳区某路 2 号',
      goods_type: '数码产品', weight: 2.5, volume: 0.02, insured: 1, insured_value: 1000,
      origin_warehouse_id: 1, dest_warehouse_id: 2,
      packages: [{ name: '手机', quantity: 1, weight: 2.5, volume: 0.02 }],
    }, dispatcherToken);
    assert.strictEqual(status, 201);
    assert.strictEqual(json.data.status, 'created');
    assert.ok(/^LT\d{8}\d{4}$/.test(json.data.waybill_no), `运单号格式应正确，实际 ${json.data.waybill_no}`);
    assert.ok(json.data.estimated_delivery, '应自动生成预计送达时间');
    sampleWaybillId = json.data.id;
  });

  // ---------- 状态机 ----------

  test('状态机：created → delivered 非法流转返回 400', async () => {
    const { status, json } = await call('PATCH', `/api/waybills/${sampleWaybillId}/status`, { status: 'delivered' }, dispatcherToken);
    assert.strictEqual(status, 400);
    assert.match(json.message, /不允许的状态流转/);
  });

  test('状态机：未知目标状态返回 400', async () => {
    const { status } = await call('PATCH', `/api/waybills/${sampleWaybillId}/status`, { status: 'flying' }, dispatcherToken);
    assert.strictEqual(status, 400);
  });

  test('状态机：缺少 status 字段返回 400', async () => {
    const { status } = await call('PATCH', `/api/waybills/${sampleWaybillId}/status`, {}, dispatcherToken);
    assert.strictEqual(status, 400);
  });

  test('状态机：重复流转到当前状态返回 400', async () => {
    const { status } = await call('PATCH', `/api/waybills/${sampleWaybillId}/status`, { status: 'created' }, dispatcherToken);
    assert.strictEqual(status, 400);
  });

  test('状态机：合法流转 created → picked_up 成功并写入时间轴', async () => {
    const { status, json } = await call('PATCH', `/api/waybills/${sampleWaybillId}/status`, {
      status: 'picked_up', note: '快递员已上门揽收', warehouse_id: 1,
    }, dispatcherToken);
    assert.strictEqual(status, 200);
    assert.strictEqual(json.data.status, 'picked_up');

    const tl = await call('GET', `/api/waybills/${sampleWaybillId}/timeline`, null, dispatcherToken);
    assert.strictEqual(tl.status, 200);
    const statuses = tl.json.data.nodes.map((n) => n.status);
    assert.ok(statuses.includes('picked_up'), '时间轴应包含揽收节点');
    assert.ok(tl.json.data.scans.length >= 2, '应至少有创建 + 揽收两条扫描记录');
    assert.ok(tl.json.data.summary.total_nodes >= 3, '应含寄件地锚点');
  });

  test('状态机：完整链路走到 delivered 成功', async () => {
    for (const s of ['in_transit', 'arrived_hub', 'out_for_delivery']) {
      const { status } = await call('PATCH', `/api/waybills/${sampleWaybillId}/status`, { status: s, warehouse_id: 2 }, dispatcherToken);
      assert.strictEqual(status, 200, `流转到 ${s} 应成功`);
    }
    const { status, json } = await call('PATCH', `/api/waybills/${sampleWaybillId}/status`, { status: 'delivered', note: '李四' }, dispatcherToken);
    assert.strictEqual(status, 200);
    assert.strictEqual(json.data.status, 'delivered');
    assert.ok(json.data.actual_delivery, '签收后应写入实际签收时间');
  });

  test('状态机：终态 delivered 不可再流转（400）', async () => {
    const { status } = await call('PATCH', `/api/waybills/${sampleWaybillId}/status`, { status: 'in_transit' }, dispatcherToken);
    assert.strictEqual(status, 400);
  });

  test('状态机：异常分支 exception → 回到 in_transit 合法', async () => {
    // 新建一张单走到 in_transit
    const created = await call('POST', '/api/waybills', {
      sender_name: '王五', sender_phone: '13800000003', receiver_name: '赵六',
      receiver_phone: '13900000004', receiver_address: '广州市天河区某路 3 号',
      origin_warehouse_id: 3, dest_warehouse_id: 4, weight: 1,
    }, dispatcherToken);
    const id = created.json.data.id;
    await call('PATCH', `/api/waybills/${id}/status`, { status: 'picked_up' }, dispatcherToken);
    await call('PATCH', `/api/waybills/${id}/status`, { status: 'in_transit' }, dispatcherToken);

    const toEx = await call('PATCH', `/api/waybills/${id}/status`, { status: 'exception', note: '收件人拒收' }, dispatcherToken);
    assert.strictEqual(toEx.status, 200);
    assert.strictEqual(toEx.json.data.exception_flag, 1);

    const back = await call('PATCH', `/api/waybills/${id}/status`, { status: 'in_transit', note: '改址后重新派送' }, dispatcherToken);
    assert.strictEqual(back.status, 200);
    assert.strictEqual(back.json.data.exception_flag, 0, '恢复运输后异常标记应清除');

    const toReturn = await call('PATCH', `/api/waybills/${id}/status`, { status: 'exception' }, dispatcherToken);
    assert.strictEqual(toReturn.status, 200);
    const ret = await call('PATCH', `/api/waybills/${id}/status`, { status: 'returned' }, dispatcherToken);
    assert.strictEqual(ret.status, 200);
    assert.strictEqual(ret.json.data.status, 'returned');
  });

  test('扫描接口：不带状态时只追加扫描记录', async () => {
    const created = await call('POST', '/api/waybills', {
      sender_name: '孙七', sender_phone: '13800000005', receiver_name: '周八',
      receiver_phone: '13900000006', receiver_address: '深圳市南山区某路 4 号',
      origin_warehouse_id: 4, dest_warehouse_id: 5, weight: 3,
    }, dispatcherToken);
    const id = created.json.data.id;
    const before = await call('GET', `/api/waybills/${id}/scans`, null, dispatcherToken);
    const scan = await call('POST', `/api/waybills/${id}/scan`, { scan_type: 'inbound', warehouse_id: 4, note: '网点入库扫描' }, dispatcherToken);
    assert.strictEqual(scan.status, 201);
    const after = await call('GET', `/api/waybills/${id}/scans`, null, dispatcherToken);
    assert.strictEqual(after.json.data.total, before.json.data.total + 1, '扫描记录数应 +1');
    assert.strictEqual(scan.json.data.waybill.status, 'created', '未指定 status 时状态不应变化');
  });

  test('下一步状态接口返回状态机允许的流转', async () => {
    const { status, json } = await call('GET', `/api/waybills/${sampleWaybillId}/next`, null, courierToken);
    assert.strictEqual(status, 200);
    assert.strictEqual(json.data.current, 'delivered');
    assert.deepStrictEqual(json.data.next, [], '已签收没有下一步');
  });

  // ---------- 分页 / 搜索 / 筛选 ----------

  test('运单列表分页：pageSize 生效且 total 正确', async () => {
    const p1 = await call('GET', '/api/waybills?page=1&pageSize=5', null, adminToken);
    assert.strictEqual(p1.status, 200);
    assert.ok(p1.json.data.list.length <= 5);
    assert.strictEqual(p1.json.data.page, 1);
    assert.strictEqual(p1.json.data.pageSize, 5);
    assert.ok(p1.json.data.total >= 30, `种子应有 ≥30 张运单，实际 ${p1.json.data.total}`);
    assert.strictEqual(p1.json.data.pages, Math.ceil(p1.json.data.total / 5));
  });

  test('运单列表分页边界：pageSize 超上限被压到 100', async () => {
    const { json } = await call('GET', '/api/waybills?page=1&pageSize=9999', null, adminToken);
    assert.strictEqual(json.data.pageSize, 100);
  });

  test('运单列表分页边界：page 为 0 或负数回落到第 1 页', async () => {
    const { json } = await call('GET', '/api/waybills?page=0&pageSize=5', null, adminToken);
    assert.strictEqual(json.data.page, 1);
    const neg = await call('GET', '/api/waybills?page=-3&pageSize=5', null, adminToken);
    assert.strictEqual(neg.json.data.page, 1);
  });

  test('运单列表搜索：按运单号可命中唯一记录', async () => {
    const list = await call('GET', '/api/waybills?pageSize=1', null, adminToken);
    const no = list.json.data.list[0].waybill_no;
    const { json } = await call('GET', `/api/waybills?q=${encodeURIComponent(no)}`, null, adminToken);
    assert.strictEqual(json.data.total, 1);
    assert.strictEqual(json.data.list[0].waybill_no, no);
  });

  test('运单列表搜索：按收件人手机号可命中', async () => {
    const list = await call('GET', '/api/waybills?pageSize=1', null, adminToken);
    const phone = list.json.data.list[0].receiver_phone;
    const { json } = await call('GET', `/api/waybills?q=${phone}`, null, adminToken);
    assert.ok(json.data.total >= 1, '按手机号应能查到运单');
  });

  test('运单列表筛选：按状态过滤结果全部匹配', async () => {
    const { json } = await call('GET', '/api/waybills?status=delivered&pageSize=50', null, adminToken);
    assert.ok(json.data.total >= 1);
    json.data.list.forEach((w) => assert.strictEqual(w.status, 'delivered'));
  });

  test('运单列表筛选：未指派筛选 unassigned=1', async () => {
    const { json } = await call('GET', '/api/waybills?unassigned=1&pageSize=50', null, adminToken);
    json.data.list.forEach((w) => assert.strictEqual(w.driver_id, 0));
  });

  test('通用 CRUD：网点列表支持分页与搜索', async () => {
    const all = await call('GET', '/api/entities/warehouses?pageSize=50', null, adminToken);
    assert.ok(all.json.data.total >= 8, `种子应有 ≥8 个网点，实际 ${all.json.data.total}`);
    const { json } = await call('GET', '/api/entities/warehouses?q=上海', null, adminToken);
    assert.ok(json.data.total >= 1);
    assert.match(json.data.list[0].name, /上海/);
  });

  test('通用 CRUD：不存在记录返回 404', async () => {
    const { status } = await call('GET', '/api/entities/warehouses/999999', null, adminToken);
    assert.strictEqual(status, 404);
  });

  test('API 404 返回 JSON 而非 HTML', async () => {
    const { status, json } = await call('GET', '/api/definitely-not-exist');
    assert.strictEqual(status, 404);
    assert.notStrictEqual(json.code, 0);
  });

  // ---------- 调度 ----------

  test('调度：指派司机后运单 driver_id 更新且通知生成', async () => {
    const pending = await call('GET', '/api/ops/dispatch/pending?pageSize=5', null, dispatcherToken);
    assert.strictEqual(pending.status, 200);
    if (!pending.json.data.list.length) return; // 种子已全部分配时跳过
    const target = pending.json.data.list[0];
    const before = await call('GET', '/api/ops/notifications?pageSize=1', null, dispatcherToken);

    const assign = await call('POST', '/api/ops/dispatch/assign', {
      waybill_id: target.id, driver_id: 2,
    }, dispatcherToken);
    assert.strictEqual(assign.status, 200);

    const detail = await call('GET', `/api/waybills/${target.id}`, null, dispatcherToken);
    assert.strictEqual(detail.json.data.driver_id, 2);

    const after = await call('GET', '/api/ops/notifications?pageSize=1&all=1', null, adminToken);
    assert.ok(after.json.data.total >= before.json.data.total);
  });

  test('调度：指派不存在的司机返回 404', async () => {
    const { status } = await call('POST', '/api/ops/dispatch/assign', { waybill_id: 1, driver_id: 999999 }, dispatcherToken);
    assert.strictEqual(status, 404);
  });

  test('调度：缺少 driver_id 返回 400', async () => {
    const { status } = await call('POST', '/api/ops/dispatch/assign', { waybill_id: 1 }, dispatcherToken);
    assert.strictEqual(status, 400);
  });

  // ---------- 异常件 ----------

  test('异常列表支持按状态筛选，stats 返回分类型计数', async () => {
    const list = await call('GET', '/api/exceptions?pageSize=50', null, dispatcherToken);
    assert.strictEqual(list.status, 200);
    assert.ok(list.json.data.total >= 3, `种子应有 ≥3 条异常，实际 ${list.json.data.total}`);

    const stats = await call('GET', '/api/exceptions/stats', null, dispatcherToken);
    assert.strictEqual(stats.status, 200);
    assert.ok(typeof stats.json.data.total === 'number');
    assert.ok(Array.isArray(stats.json.data.by_type));
  });

  test('异常登记：对正常运单登记异常会走状态机挂起', async () => {
    const created = await call('POST', '/api/waybills', {
      sender_name: '钱九', sender_phone: '13800000007', receiver_name: '吴十',
      receiver_phone: '13900000008', receiver_address: '成都市武侯区某路 5 号',
      origin_warehouse_id: 6, dest_warehouse_id: 7, weight: 1.5,
    }, dispatcherToken);
    const id = created.json.data.id;

    const reg = await call('POST', '/api/exceptions', {
      waybill_id: id, ex_type: '地址错误', description: '门牌号不存在', severity: '一般',
    }, dispatcherToken);
    assert.strictEqual(reg.status, 201);

    const wb = await call('GET', `/api/waybills/${id}`, null, dispatcherToken);
    assert.strictEqual(wb.json.data.status, 'exception', '登记异常后运单应进入异常态');
  });

  test('异常处理：非法 action 返回 400', async () => {
    const stats = await call('GET', '/api/exceptions?pageSize=1', null, dispatcherToken);
    const ex = stats.json.data.list[0];
    const { status, json } = await call('POST', `/api/exceptions/${ex.id}/resolve`, { action: 'teleport' }, dispatcherToken);
    assert.strictEqual(status, 400);
    assert.match(json.message, /不支持的处理方式/);
  });

  test('异常处理：原路退回联动运单状态为 returned', async () => {
    const list = await call('GET', '/api/exceptions?ex_status=open&pageSize=20', null, dispatcherToken);
    const target = list.json.data.list.find((e) => e.waybill_status === 'exception');
    if (!target) return; // 无可用样本时跳过
    const { status, json } = await call('POST', `/api/exceptions/${target.id}/resolve`, {
      action: 'return', resolution: '按寄件人要求原路退回',
    }, dispatcherToken);
    assert.strictEqual(status, 200);
    assert.strictEqual(json.data.ex_status, 'resolved');
    const wb = await call('GET', `/api/waybills/${target.waybill_id}`, null, dispatcherToken);
    assert.strictEqual(wb.json.data.status, 'returned');
  });

  test('异常关闭：已关闭的异常不能重复处理', async () => {
    const list = await call('GET', '/api/exceptions?pageSize=1', null, dispatcherToken);
    const ex = list.json.data.list[0];
    await call('POST', `/api/exceptions/${ex.id}/close`, {}, dispatcherToken);
    const again = await call('POST', `/api/exceptions/${ex.id}/close`, {}, dispatcherToken);
    assert.strictEqual(again.status, 400);
  });

  // ---------- AI 降级 + 落库 ----------

  test('AI 时效预测：未配置 Key 时降级本地并落库 estimated_delivery', async () => {
    const created = await call('POST', '/api/waybills', {
      sender_name: '郑十一', sender_phone: '13800000009', receiver_name: '王十二',
      receiver_phone: '13900000010', receiver_address: '西安市雁塔区某路 6 号',
      origin_warehouse_id: 1, dest_warehouse_id: 8, weight: 6, volume: 0.08,
    }, dispatcherToken);
    const id = created.json.data.id;
    const before = created.json.data.estimated_delivery;

    const { status, json } = await call('POST', '/api/ai/eta', { waybill_id: id }, dispatcherToken);
    assert.strictEqual(status, 200);
    assert.strictEqual(json.data.source, 'local', '未配置 LLM_API_KEY 时应降级本地');
    assert.ok(json.data.estimated_delivery, '应返回预计送达时间');
    assert.strictEqual(json.data.persisted, true, '应标记为已落库');
    assert.ok(json.data.estimated_hours > 0);

    // ★ 验证落库真的写进了业务表，且可被后续接口读到
    const wb = await call('GET', `/api/waybills/${id}`, null, dispatcherToken);
    assert.ok(wb.json.data.estimated_delivery, '运单表应有 estimated_delivery');
    assert.notStrictEqual(wb.json.data.estimated_delivery, '', '落库值不应为空');
    assert.ok(before !== undefined);
  });

  test('AI 时效预测：不存在的运单返回 404', async () => {
    const { status } = await call('POST', '/api/ai/eta', { waybill_id: 999999 }, dispatcherToken);
    assert.strictEqual(status, 404);
  });

  test('AI 滞留识别：识别结果落库为 exceptions 记录', async () => {
    // 用极小阈值保证能识别出种子里的老运单
    const before = await call('GET', '/api/exceptions/stats', null, dispatcherToken);
    const { status, json } = await call('POST', '/api/ai/detect-stale', { hours: 1, limit: 5 }, dispatcherToken);
    assert.strictEqual(status, 200);
    assert.strictEqual(json.data.source, 'local');
    assert.ok(typeof json.data.summary === 'string' && json.data.summary.length > 0, '应返回文字判断');
    assert.ok(Array.isArray(json.data.items));

    if (json.data.created_exceptions > 0) {
      assert.strictEqual(json.data.persisted, true);
      const after = await call('GET', '/api/exceptions/stats', null, dispatcherToken);
      assert.ok(after.json.data.total >= before.json.data.total + json.data.created_exceptions,
        '异常总数应随 AI 落库而增加');

      // ★ 验证 AI 创建的异常是 source='ai'，可在异常页处理（闭环）
      const list = await call('GET', '/api/exceptions?source=ai&pageSize=10', null, dispatcherToken);
      assert.ok(list.json.data.total >= 1, '应能按 source=ai 查到 AI 生成的异常');
    }
  });

  test('AI 滞留识别：dry_run 不落库', async () => {
    const before = await call('GET', '/api/exceptions/stats', null, dispatcherToken);
    const { status, json } = await call('POST', '/api/ai/detect-stale', { hours: 1, limit: 5, dry_run: true }, dispatcherToken);
    assert.strictEqual(status, 200);
    assert.strictEqual(json.data.created_exceptions, 0);
    assert.strictEqual(json.data.persisted, false);
    const after = await call('GET', '/api/exceptions/stats', null, dispatcherToken);
    assert.strictEqual(after.json.data.total, before.json.data.total, 'dry_run 不应写入异常');
  });

  test('AI 派送路线优化：返回按里程排序的派送顺序', async () => {
    const { status, json } = await call('POST', '/api/ai/optimize-route', { driver_id: 1 }, dispatcherToken);
    assert.strictEqual(status, 200);
    assert.strictEqual(json.data.source, 'local');
    assert.strictEqual(json.data.algorithm, 'nearest-neighbor');
    assert.ok(json.data.total_distance_km >= 0);
    if (json.data.plan.length > 1) {
      json.data.plan.forEach((s, i) => assert.strictEqual(s.seq, i + 1, 'seq 应从 1 连续递增'));
    }
  });

  test('AI 接口未登录返回 401', async () => {
    const { status } = await call('POST', '/api/ai/eta', { waybill_id: 1 });
    assert.strictEqual(status, 401);
  });

  // ---------- 时间轴结构 ----------

  test('时间轴返回节点含坐标，且起终点锚点存在', async () => {
    const list = await call('GET', '/api/waybills?pageSize=1', null, adminToken);
    const id = list.json.data.list[0].id;
    const { status, json } = await call('GET', `/api/waybills/${id}/timeline`, null, adminToken);
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(json.data.nodes));
    assert.ok(json.data.waybill, '应返回运单主体');
    assert.ok(Array.isArray(json.data.packages), '应返回包裹明细');
    assert.ok(json.data.summary && typeof json.data.summary.progress === 'number');

    // 地图联动依赖坐标：至少要有能定位的节点
    const withCoord = json.data.nodes.filter((n) => n.lat && n.lng);
    assert.ok(withCoord.length >= 1, '至少一个节点应有经纬度供地图定位');
    // 节点类型可映射状态色
    json.data.nodes.forEach((n) => assert.ok(typeof n.status === 'string' && n.status.length > 0));
  });

  test('时间轴：不存在的运单返回 404', async () => {
    const { status } = await call('GET', '/api/waybills/999999/timeline', null, adminToken);
    assert.strictEqual(status, 404);
  });

  // ---------- 字典 / 通知 ----------

  test('状态机字典接口返回 8 个状态与迁移表', async () => {
    const { status, json } = await call('GET', '/api/ops/meta/statuses', null, courierToken);
    assert.strictEqual(status, 200);
    assert.strictEqual(json.data.statuses.length, 8);
    assert.deepStrictEqual(json.data.transitions.created, ['picked_up', 'exception']);
  });

  test('字典选项包含网点/司机/车辆/货物类型', async () => {
    const { status, json } = await call('GET', '/api/ops/meta/options', null, courierToken);
    assert.strictEqual(status, 200);
    assert.ok(json.data.warehouses.length >= 8);
    assert.ok(json.data.drivers.length >= 6);
    assert.ok(json.data.vehicles.length >= 6);
    assert.ok(json.data.goods_types.length >= 5);
  });

  test('通知中心：未读数与全部已读', async () => {
    const before = await call('GET', '/api/ops/notifications/unread-count', null, adminToken);
    assert.strictEqual(before.status, 200);
    assert.ok(typeof before.json.data.unread === 'number');

    const readAll = await call('POST', '/api/ops/notifications/read-all', {}, adminToken);
    assert.strictEqual(readAll.status, 200);

    const after = await call('GET', '/api/ops/notifications/unread-count', null, adminToken);
    assert.strictEqual(after.json.data.unread, 0);
  });

  test('车队任务接口返回司机与车辆及其当前任务', async () => {
    const { status, json } = await call('GET', '/api/ops/fleet/tasks', null, dispatcherToken);
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(json.data.drivers) && json.data.drivers.length >= 6);
    assert.ok(Array.isArray(json.data.vehicles) && json.data.vehicles.length >= 6);
    json.data.drivers.forEach((d) => {
      assert.ok(typeof d.active_tasks === 'number');
      assert.ok(Array.isArray(d.tasks));
    });
  });

  // ---------- Admin 概览 ----------

  test('Admin 概览返回完整统计指标', async () => {
    const { status, json } = await call('GET', '/api/admin/overview', null, adminToken);
    assert.strictEqual(status, 200);
    const d = json.data;
    assert.ok(typeof d.users === 'number');
    assert.ok(d.waybills_total >= 30, `运单总数应 ≥30，实际 ${d.waybills_total}`);
    assert.ok(typeof d.exception_rate === 'number');
    assert.ok(typeof d.on_time_rate === 'number');
    assert.ok(typeof d.avg_delivery_hours === 'number');
    assert.ok(Array.isArray(d.trend) && d.trend.length >= 7, `趋势应有 ≥7 天数据，实际 ${d.trend?.length}`);
    assert.ok(Array.isArray(d.warehouse_rank) && d.warehouse_rank.length >= 8);
    assert.ok(Array.isArray(d.status_dist) && d.status_dist.length >= 6);
    assert.ok(Array.isArray(d.exception_dist));
    assert.ok(Array.isArray(d.driver_load));
  });

  test('Admin 用户列表不包含密码字段', async () => {
    const { status, json } = await call('GET', '/api/admin/users', null, adminToken);
    assert.strictEqual(status, 200);
    assert.ok(json.data.length >= 3);
    json.data.forEach((u) => {
      assert.strictEqual(u.password, undefined);
      assert.strictEqual(u.password_hash, undefined);
    });
  });

  // ---------- 种子数据厚度 ----------

  test('种子数据：8 个状态都有运单覆盖', async () => {
    const statuses = ['created', 'picked_up', 'in_transit', 'arrived_hub', 'out_for_delivery', 'delivered', 'exception', 'returned'];
    for (const s of statuses) {
      const { json } = await call('GET', `/api/waybills?status=${s}&pageSize=1`, null, adminToken);
      assert.ok(json.data.total >= 1, `状态 ${s} 应至少有一张种子运单`);
    }
  });

  test('种子数据：运单跨 ≥7 个日期', async () => {
    const { json } = await call('GET', '/api/waybills?pageSize=100', null, adminToken);
    const days = new Set(json.data.list.map((w) => String(w.created_at).slice(0, 10)));
    assert.ok(days.size >= 7, `运单应跨 ≥7 天，实际 ${days.size} 天`);
  });
}

module.exports = { runSuite };
