// CityLens 领域深化测试：工单状态机、越权、分页边界、AI 降级落库、日志写入。
// 与 core.test.js（内核通用套件）互补，共同构成本系统的后端用例集。
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { createApp } = require('../kernel').server;
const { mountRoutes } = require('../routes');
const { db } = require('../db');
const { canTransition, nextStates, transitionError } = require('../src/workflow');

const PORT = 5212;
let server;
let base;
let adminToken;
let userToken;

before(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-suite';
  const app = createApp({ mountRoutes, frontendDir: 'nonexistent-dist' });
  server = app.listen(PORT);
  base = `http://127.0.0.1:${PORT}`;
  adminToken = await login('admin', 'admin123');
  userToken = await login('inspector1', 'inspector123');
});

after(() => { if (server) server.close(); });

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* 忽略非 JSON */ }
  return { status: res.status, json };
}

async function login(username, password) {
  const { json } = await call('POST', '/api/auth/login', { username, password });
  return json.data.token;
}

// 直接建一张干净工单用于流转测试，避免污染种子数据的预期状态。
function makeOrder() {
  const code = 'TEST' + Date.now() + Math.floor(Math.random() * 1000);
  const info = db.prepare(
    'INSERT INTO work_orders (code, facility_id, status, priority, created_by, description) VALUES (?,?,?,?,?,?)'
  ).run(code, 1, 'created', 'normal', 1, '自动化测试工单');
  const id = info.lastInsertRowid;
  db.prepare('INSERT INTO work_order_logs (order_id, from_status, to_status, operator_id, remark) VALUES (?,?,?,?,?)')
    .run(id, null, 'created', 1, '测试建单');
  return id;
}

function logsOf(id) {
  return db.prepare('SELECT * FROM work_order_logs WHERE order_id = ? ORDER BY id ASC').all(id);
}

// ---------------------------------------------------------------- 状态机单元
test('状态机：六个状态与允许流转的静态定义正确', () => {
  assert.deepStrictEqual(nextStates('created'), ['assigned']);
  assert.deepStrictEqual(nextStates('resolved'), ['verified', 'in_progress']);
  assert.deepStrictEqual(nextStates('closed'), []);
  assert.ok(canTransition('in_progress', 'resolved'));
  assert.ok(!canTransition('created', 'closed'));
  assert.ok(!canTransition('closed', 'assigned'));
  assert.match(transitionError('created', 'closed'), /非法流转/);
});

// ---------------------------------------------------------------- 工单接口
test('工单列表未登录返回 401', async () => {
  const { status, json } = await call('GET', '/api/work-orders');
  assert.strictEqual(status, 401);
  assert.notStrictEqual(json.code, 0);
});

test('工单列表：page=0 被规整为第 1 页', async () => {
  const { status, json } = await call('GET', '/api/work-orders?page=0', undefined, adminToken);
  assert.strictEqual(status, 200);
  assert.strictEqual(json.data.page, 1);
  assert.ok(Array.isArray(json.data.list));
});

test('工单列表：pageSize=1000 被压到上限 100', async () => {
  const { status, json } = await call('GET', '/api/work-orders?pageSize=1000', undefined, adminToken);
  assert.strictEqual(status, 200);
  assert.ok(json.data.pageSize <= 100, 'pageSize 应有上限保护');
});

test('工单列表：按状态筛选只返回该状态', async () => {
  const { status, json } = await call('GET', '/api/work-orders?status=closed', undefined, adminToken);
  assert.strictEqual(status, 200);
  assert.ok(json.data.total >= 1);
  assert.ok(json.data.list.every((r) => r.status === 'closed'));
});

test('工单列表：按区域筛选（经设施归属）生效', async () => {
  const district = db.prepare('SELECT id FROM districts ORDER BY id ASC').get().id;
  const { status, json } = await call('GET', '/api/work-orders?district=' + district, undefined, adminToken);
  assert.strictEqual(status, 200);
  assert.ok(json.data.list.every((r) => r.district_id === district));
});

test('工单详情返回日志时间轴', async () => {
  const id = makeOrder();
  const { status, json } = await call('GET', `/api/work-orders/${id}`, undefined, adminToken);
  assert.strictEqual(status, 200);
  assert.strictEqual(json.data.id, id);
  assert.ok(Array.isArray(json.data.logs));
  assert.ok(json.data.logs.length >= 1);
  assert.deepStrictEqual(json.data.next_status, ['assigned']);
});

test('工单详情：不存在的 id 返回 404', async () => {
  const { status } = await call('GET', '/api/work-orders/99999999', undefined, adminToken);
  assert.strictEqual(status, 404);
});

test('非法流转 created → closed 返回 400', async () => {
  const id = makeOrder();
  const { status, json } = await call('PATCH', `/api/work-orders/${id}/status`, { status: 'closed' }, adminToken);
  assert.strictEqual(status, 400);
  assert.match(json.message, /非法流转/);
  assert.strictEqual(db.prepare('SELECT status FROM work_orders WHERE id = ?').get(id).status, 'created');
});

test('非法流转 created → in_progress 返回 400（不能跳级）', async () => {
  const id = makeOrder();
  const { status } = await call('PATCH', `/api/work-orders/${id}/status`, { status: 'in_progress' }, adminToken);
  assert.strictEqual(status, 400);
});

test('未知目标状态返回 400', async () => {
  const id = makeOrder();
  const { status } = await call('PATCH', `/api/work-orders/${id}/status`, { status: 'flying' }, adminToken);
  assert.strictEqual(status, 400);
});

test('派单缺少 team_id 返回 400', async () => {
  const id = makeOrder();
  const { status, json } = await call('PATCH', `/api/work-orders/${id}/status`, { status: 'assigned' }, adminToken);
  assert.strictEqual(status, 400);
  assert.match(json.message, /班组/);
});

test('派单到不存在的班组返回 400', async () => {
  const id = makeOrder();
  const { status } = await call('PATCH', `/api/work-orders/${id}/status`, { status: 'assigned', team_id: 987654 }, adminToken);
  assert.strictEqual(status, 400);
});

test('合法全链路 created→assigned→in_progress→resolved→verified→closed 且日志完整', async () => {
  const id = makeOrder();
  const teamId = db.prepare('SELECT id FROM maintenance_teams ORDER BY id ASC').get().id;
  const steps = [
    ['assigned', { team_id: teamId, remark: '派单测试' }],
    ['in_progress', {}],
    ['resolved', { resolution: '测试修复完成' }],
    ['verified', {}],
    ['closed', {}],
  ];
  for (const [st, extra] of steps) {
    const { status, json } = await call('PATCH', `/api/work-orders/${id}/status`, { status: st, ...extra }, adminToken);
    assert.strictEqual(status, 200, `${st} 应流转成功：${json && json.message}`);
    assert.strictEqual(json.data.status, st);
  }
  const row = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id);
  assert.strictEqual(row.status, 'closed');
  assert.ok(row.assigned_at && row.resolved_at && row.verified_at && row.closed_at, '四个时间戳都应写入');
  assert.strictEqual(row.resolution, '测试修复完成');

  const logs = logsOf(id);
  assert.strictEqual(logs.length, 6, '建单 + 5 次流转 = 6 条日志');
  assert.deepStrictEqual(logs.map((l) => l.to_status), ['created', 'assigned', 'in_progress', 'resolved', 'verified', 'closed']);
  assert.strictEqual(logs[1].from_status, 'created');
  assert.strictEqual(logs[5].from_status, 'verified');
  assert.ok(logs.every((l) => l.operator_id), '每条日志都应有操作人');
});

test('退回重做 resolved → in_progress 被允许', async () => {
  const id = makeOrder();
  const teamId = db.prepare('SELECT id FROM maintenance_teams ORDER BY id ASC').get().id;
  await call('PATCH', `/api/work-orders/${id}/status`, { status: 'assigned', team_id: teamId }, adminToken);
  await call('PATCH', `/api/work-orders/${id}/status`, { status: 'in_progress' }, adminToken);
  await call('PATCH', `/api/work-orders/${id}/status`, { status: 'resolved' }, adminToken);
  const { status, json } = await call('PATCH', `/api/work-orders/${id}/status`, { status: 'in_progress', remark: '验收不通过，退回重做' }, adminToken);
  assert.strictEqual(status, 200);
  assert.strictEqual(json.data.status, 'in_progress');
  const logs = logsOf(id);
  assert.strictEqual(logs[logs.length - 1].from_status, 'resolved');
  assert.strictEqual(logs[logs.length - 1].to_status, 'in_progress');
});

test('终态 closed 不可再流转', async () => {
  const id = makeOrder();
  db.prepare("UPDATE work_orders SET status = 'closed' WHERE id = ?").run(id);
  const { status } = await call('PATCH', `/api/work-orders/${id}/status`, { status: 'assigned', team_id: 1 }, adminToken);
  assert.strictEqual(status, 400);
});

test('流转写入站内通知给上报人', async () => {
  const before = db.prepare('SELECT COUNT(*) AS c FROM notifications').get().c;
  const id = makeOrder();
  const teamId = db.prepare('SELECT id FROM maintenance_teams ORDER BY id ASC').get().id;
  db.prepare('UPDATE work_orders SET fault_id = 1 WHERE id = ?').run(id);
  await call('PATCH', `/api/work-orders/${id}/status`, { status: 'assigned', team_id: teamId }, adminToken);
  const after = db.prepare('SELECT COUNT(*) AS c FROM notifications').get().c;
  assert.ok(after > before, '派单应触发通知');
});

// ---------------------------------------------------------------- AI 闭环
test('AI 诊断写入 faults.diagnosis 并自动创建工单（source=local 降级）', async () => {
  const fault = db.prepare('SELECT * FROM faults WHERE diagnosis = \'\' OR diagnosis IS NULL ORDER BY id ASC').get();
  assert.ok(fault, '应存在未诊断的故障用于测试');

  const before = db.prepare('SELECT COUNT(*) AS c FROM work_orders').get().c;
  const { status, json } = await call('POST', `/api/faults/${fault.id}/diagnose`, {}, adminToken);
  assert.strictEqual(status, 200);
  assert.strictEqual(json.data.source, 'local', '未配置 Key 时应降级本地规则');
  assert.ok(json.data.diagnosis && json.data.diagnosis.length > 10);
  assert.strictEqual(json.data.auto_created, true);
  assert.strictEqual(json.data.work_order.status, 'created');
  assert.strictEqual(json.data.work_order.fault_id, fault.id);

  const after = db.prepare('SELECT COUNT(*) AS c FROM work_orders').get().c;
  assert.strictEqual(after, before + 1, '诊断应恰好新增一张工单');

  const saved = db.prepare('SELECT diagnosis, diagnosed_at, status FROM faults WHERE id = ?').get(fault.id);
  assert.ok(saved.diagnosis.includes('诊断结论'), '诊断文本应落库');
  assert.ok(saved.diagnosed_at, '诊断时间应落库');
  assert.strictEqual(saved.status, '处理中');

  const logs = logsOf(json.data.work_order.id);
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].to_status, 'created');
});

test('AI 诊断：不存在的故障返回 404', async () => {
  const { status } = await call('POST', '/api/faults/99999999/diagnose', {}, adminToken);
  assert.strictEqual(status, 404);
});

test('AI 派单返回推荐班组与理由（source=local）', async () => {
  const fault = db.prepare("SELECT * FROM faults WHERE title LIKE '%监控%' ORDER BY id ASC").get();
  const { status, json } = await call('POST', '/api/ai/dispatch', { fault_id: fault.id }, adminToken);
  assert.strictEqual(status, 200);
  assert.ok(json.data.recommended_team_id, '应给出推荐班组');
  assert.ok(json.data.reason && json.data.reason.length > 5);
  assert.strictEqual(json.data.source, 'local');
  assert.ok(Array.isArray(json.data.candidates) && json.data.candidates.length >= 2);
  // 监控类故障应推荐到弱电监控相关班组（专长匹配优先于负载）。
  const rec = json.data.recommended_team;
  assert.match(rec.specialties + rec.name, /弱电|监控/);
});

test('AI 派单：无参数返回 400', async () => {
  const { status } = await call('POST', '/api/ai/dispatch', {}, adminToken);
  assert.strictEqual(status, 400);
});

// ---------------------------------------------------------------- 越权与通知
test('普通用户访问 admin overview 返回 403', async () => {
  const { status, json } = await call('GET', '/api/admin/overview', undefined, userToken);
  assert.strictEqual(status, 403);
  assert.notStrictEqual(json.code, 0);
});

test('admin overview 含工单状态分布与班组负载', async () => {
  const { status, json } = await call('GET', '/api/admin/overview', undefined, adminToken);
  assert.strictEqual(status, 200);
  assert.ok(Array.isArray(json.data.work_orders_by_status));
  assert.strictEqual(json.data.work_orders_by_status.length, 6, '六个状态都应出现');
  assert.ok(typeof json.data.work_orders_total === 'number');
  assert.ok(Array.isArray(json.data.district_stats));
  assert.ok(Array.isArray(json.data.team_load));
});

test('通知列表返回未读数', async () => {
  const { status, json } = await call('GET', '/api/notifications', undefined, adminToken);
  assert.strictEqual(status, 200);
  assert.ok(Array.isArray(json.data.list));
  assert.ok(typeof json.data.unread === 'number');
});

test('越权标记他人通知为已读返回 403', async () => {
  const other = db.prepare('SELECT * FROM notifications WHERE user_id != (SELECT id FROM users WHERE username = ?) ORDER BY id ASC LIMIT 1').get('admin');
  assert.ok(other);
  const { status } = await call('PATCH', `/api/notifications/${other.id}/read`, {}, adminToken);
  assert.strictEqual(status, 403);
});

// ---------------------------------------------------------------- 主数据 CRUD
test('区域 CRUD：新增 → 更新 → 删除', async () => {
  const code = 'T' + Date.now().toString().slice(-5);
  const created = await call('POST', '/api/entities/districts', { name: '测试区', code, center_lat: 36.6, center_lng: 117.0 }, adminToken);
  assert.strictEqual(created.status, 201);
  const id = created.json.data.id;

  const updated = await call('PUT', `/api/entities/districts/${id}`, { note: '已更新备注' }, adminToken);
  assert.strictEqual(updated.status, 200);
  assert.strictEqual(updated.json.data.note, '已更新备注');

  const removed = await call('DELETE', `/api/entities/districts/${id}`, undefined, adminToken);
  assert.strictEqual(removed.status, 200);
  const gone = await call('GET', `/api/entities/districts/${id}`, undefined, adminToken);
  assert.strictEqual(gone.status, 404);
});

test('设施类型：缺必填字段返回 400', async () => {
  const { status } = await call('POST', '/api/entities/facility-types', { note: '没有名称' }, adminToken);
  assert.strictEqual(status, 400);
});

test('设施类型列表可按关键词搜索', async () => {
  const { status, json } = await call('GET', '/api/entities/facility-types?q=路灯', undefined, adminToken);
  assert.strictEqual(status, 200);
  assert.ok(json.data.list.some((r) => r.name.includes('路灯')));
});

test('班组：capacity 作为数字写入并可排序读取', async () => {
  const created = await call('POST', '/api/entities/maintenance-teams', { name: '测试班组', leader: '测试员', capacity: '5' }, adminToken);
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.json.data.capacity, 5, '字符串数字应被转换');
  await call('DELETE', `/api/entities/maintenance-teams/${created.json.data.id}`, undefined, adminToken);
});

test('巡检路线：facility_ids 以数组形式返回', async () => {
  const { status, json } = await call('GET', '/api/entities/inspection-routes', undefined, adminToken);
  assert.strictEqual(status, 200);
  assert.ok(json.data.list.length >= 5);
  const route = json.data.list[0];
  assert.ok(Array.isArray(route.facility_ids), 'facility_ids 应解析为数组');
  assert.ok(route.facility_ids.length > 0);
});

test('巡检路线详情：有序设施点数量与种子一致', async () => {
  const list = await call('GET', '/api/entities/inspection-routes', undefined, adminToken);
  const first = list.json.data.list.find((r) => r.name.includes('历下区'));
  const { status, json } = await call('GET', `/api/entities/inspection-routes/${first.id}`, undefined, adminToken);
  assert.strictEqual(status, 200);
  assert.strictEqual(json.data.facility_ids.length, 6);
});
