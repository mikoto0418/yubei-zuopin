// KitchenFlow 业务测试：状态机非法流转、越权、分页边界、AI 降级落库、档口任务闭环。
'use strict';
// 测试使用独立数据库，避免污染开发库。
process.env.DB_PATH = require('path').join(__dirname, '..', 'data', 'kitchenflow.test.db');
process.env.JWT_SECRET = 'kf-test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');

// 每次测试从干净库开始：删掉旧测试库再种子。
const TEST_DB = process.env.DB_PATH;
for (const suffix of ['', '-shm', '-wal']) {
  try { fs.unlinkSync(TEST_DB + suffix); } catch { /* 不存在则忽略 */ }
}

const { createApp } = require('../kernel').server;
const { mountRoutes } = require('../routes');
const { seedIfNeeded } = require('../db');
seedIfNeeded();

const PORT = 5291;
const base = `http://127.0.0.1:${PORT}`;
let server;
let adminToken, waiterToken, chefToken;

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* 非 JSON 忽略 */ }
  return { status: res.status, json };
}

before(async () => {
  const app = createApp({ mountRoutes });
  server = app.listen(PORT);
  const a = await call('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  const w = await call('POST', '/api/auth/login', { username: 'waiter1', password: 'waiter123' });
  const c = await call('POST', '/api/auth/login', { username: 'chef1', password: 'chef123' });
  adminToken = a.json.data.token;
  waiterToken = w.json.data.token;
  chefToken = c.json.data.token;
});

after(() => { if (server) server.close(); });

// ---------- 种子数据厚度 ----------
test('种子数据：账号与主表数量达标', async () => {
  const r = await call('GET', '/api/admin/overview', null, adminToken);
  assert.strictEqual(r.status, 200);
  const d = r.json.data;
  assert.ok(d.tables >= 12, `桌台应 ≥12，实际 ${d.tables}`);
  assert.ok(d.menu_items >= 25, `菜品应 ≥25，实际 ${d.menu_items}`);
  assert.ok(d.orders_total >= 40, `订单应 ≥40，实际 ${d.orders_total}`);
  assert.ok(d.trend.length >= 7, `趋势应跨 ≥7 天，实际 ${d.trend.length}`);
});

test('种子数据：菜品已挂到 4 个档口', async () => {
  const r = await call('GET', '/api/entities/stations', null, adminToken);
  assert.strictEqual(r.json.data.list.length, 4);
});

test('种子数据：班次跨 7 天且 ≥15 条', async () => {
  const r = await call('GET', '/api/entities/shifts?pageSize=100', null, adminToken);
  assert.ok(r.json.data.total >= 15, `班次应 ≥15，实际 ${r.json.data.total}`);
  const days = new Set(r.json.data.list.map((s) => s.shift_date));
  assert.ok(days.size >= 7, `班次应跨 ≥7 天，实际 ${days.size}`);
});

// ---------- 鉴权与越权 ----------
test('waiter 访问 admin 概览返回 403', async () => {
  const r = await call('GET', '/api/admin/overview', null, waiterToken);
  assert.strictEqual(r.status, 403);
});

test('waiter 调用会写库的 AI 预测返回 403（仅店长）', async () => {
  const r = await call('POST', '/api/ai/forecast-demand', {}, waiterToken);
  assert.strictEqual(r.status, 403);
});

test('注册时可选择角色，越界角色回落 waiter', async () => {
  const uname = 'role' + Date.now();
  const ok1 = await call('POST', '/api/auth/register', { username: uname, password: 'pass1234', role: 'chef' });
  assert.strictEqual(ok1.json.data.user.role, 'chef');
  const ok2 = await call('POST', '/api/auth/register', { username: uname + 'x', password: 'pass1234', role: 'superuser' });
  assert.strictEqual(ok2.json.data.user.role, 'waiter');
});

// ---------- 下单 ----------
test('下单成功：生成订单号、明细与初始日志', async () => {
  const menu = await call('GET', '/api/entities/menu-items?pageSize=3', null, waiterToken);
  const items = menu.json.data.list.slice(0, 2).map((m) => ({ menu_item_id: m.id, quantity: 1, note: '少辣' }));
  const tables = await call('GET', '/api/entities/tables?status=idle', null, waiterToken);
  const tableId = tables.json.data.list[0].id;

  const r = await call('POST', '/api/orders', { table_id: tableId, items, customer_name: '测试客', people_count: 2 }, waiterToken);
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.json.data.status, 'pending');
  assert.strictEqual(r.json.data.items.length, 2);
  assert.ok(r.json.data.order_no.startsWith('KF'));
  assert.ok(r.json.data.total_amount > 0);
  assert.strictEqual(r.json.data.logs.length, 1);
  assert.strictEqual(r.json.data.logs[0].to_status, 'pending');
});

test('下单缺少明细返回 400', async () => {
  const r = await call('POST', '/api/orders', { customer_name: '空单' }, waiterToken);
  assert.strictEqual(r.status, 400);
});

test('下单引用不存在的菜品返回 400', async () => {
  const r = await call('POST', '/api/orders', { items: [{ menu_item_id: 999999, quantity: 1 }] }, waiterToken);
  assert.strictEqual(r.status, 400);
});

test('下单后桌台转为占用并绑定订单', async () => {
  const tables = await call('GET', '/api/entities/tables?status=idle', null, waiterToken);
  const tableId = tables.json.data.list[0].id;
  const menu = await call('GET', '/api/entities/menu-items?pageSize=1', null, waiterToken);
  const created = await call('POST', '/api/orders', {
    table_id: tableId, items: [{ menu_item_id: menu.json.data.list[0].id, quantity: 1 }],
  }, waiterToken);
  const t = await call('GET', `/api/entities/tables/${tableId}`, null, waiterToken);
  assert.strictEqual(t.json.data.status, 'occupied');
  assert.strictEqual(t.json.data.current_order_id, created.json.data.id);
});

// ---------- 状态机 ----------
test('状态机：pending → cooking 属于非法流转，返回 400', async () => {
  const r = await call('GET', '/api/orders?status=pending&pageSize=1', null, chefToken);
  const orderId = r.json.data.list[0].id;
  const bad = await call('PATCH', `/api/orders/${orderId}/status`, { status: 'cooking' }, chefToken);
  assert.strictEqual(bad.status, 400);
});

test('状态机：pending → paid 属于非法流转，返回 400', async () => {
  const r = await call('GET', '/api/orders?status=pending&pageSize=1', null, adminToken);
  const orderId = r.json.data.list[0].id;
  const bad = await call('PATCH', `/api/orders/${orderId}/status`, { status: 'paid' }, adminToken);
  assert.strictEqual(bad.status, 400);
});

test('状态机：未知状态返回 400', async () => {
  const r = await call('GET', '/api/orders?status=pending&pageSize=1', null, adminToken);
  const bad = await call('PATCH', `/api/orders/${r.json.data.list[0].id}/status`, { status: 'flying' }, adminToken);
  assert.strictEqual(bad.status, 400);
});

test('状态机：waiter 无权接单，返回 403', async () => {
  const r = await call('GET', '/api/orders?status=pending&pageSize=1', null, waiterToken);
  const bad = await call('PATCH', `/api/orders/${r.json.data.list[0].id}/status`, { status: 'accepted' }, waiterToken);
  assert.strictEqual(bad.status, 403);
});

test('状态机全链路：pending→accepted→cooking→ready→served→paid', async () => {
  const menu = await call('GET', '/api/entities/menu-items?pageSize=2', null, waiterToken);
  const items = menu.json.data.list.map((m) => ({ menu_item_id: m.id, quantity: 1 }));
  const created = await call('POST', '/api/orders', { items }, waiterToken);
  const id = created.json.data.id;

  const steps = [
    ['accepted', chefToken], ['cooking', chefToken], ['ready', chefToken],
    ['served', waiterToken], ['paid', waiterToken],
  ];
  for (const [status, token] of steps) {
    const r = await call('PATCH', `/api/orders/${id}/status`, { status }, token);
    assert.strictEqual(r.status, 200, `${status} 应成功：${r.json.message}`);
    assert.strictEqual(r.json.data.status, status);
  }
  const final = await call('GET', `/api/orders/${id}`, null, adminToken);
  assert.strictEqual(final.json.data.status, 'paid');
  assert.ok(final.json.data.paid_at, '结账时间应落库');
  // 状态机日志应完整记录 6 步
  assert.strictEqual(final.json.data.logs.length, 6);
});

test('状态机：cancelled 后不可再流转', async () => {
  const menu = await call('GET', '/api/entities/menu-items?pageSize=1', null, waiterToken);
  const created = await call('POST', '/api/orders', {
    items: [{ menu_item_id: menu.json.data.list[0].id, quantity: 1 }],
  }, waiterToken);
  const id = created.json.data.id;
  const c = await call('PATCH', `/api/orders/${id}/status`, { status: 'cancelled', reason: '测试取消' }, waiterToken);
  assert.strictEqual(c.status, 200);
  const after = await call('PATCH', `/api/orders/${id}/status`, { status: 'accepted' }, chefToken);
  assert.strictEqual(after.status, 400);
});

// ---------- 档口任务闭环 ----------
test('接单自动生成档口任务', async () => {
  const menu = await call('GET', '/api/entities/menu-items?pageSize=3', null, waiterToken);
  const items = menu.json.data.list.map((m) => ({ menu_item_id: m.id, quantity: 1 }));
  const created = await call('POST', '/api/orders', { items }, waiterToken);
  const id = created.json.data.id;
  const before = await call('GET', `/api/orders/${id}`, null, chefToken);
  assert.strictEqual(before.json.data.tasks.length, 0, '接单前不应有档口任务');

  await call('PATCH', `/api/orders/${id}/status`, { status: 'accepted' }, chefToken);
  const after = await call('GET', `/api/orders/${id}`, null, chefToken);
  assert.ok(after.json.data.tasks.length > 0, '接单后应生成档口任务');
  for (const t of after.json.data.tasks) {
    assert.ok(t.station_id, '任务应归属到档口');
    assert.strictEqual(t.status, 'pending');
  }
});

test('全部档口任务完成后订单自动出餐', async () => {
  const menu = await call('GET', '/api/entities/menu-items?pageSize=2', null, waiterToken);
  const created = await call('POST', '/api/orders', {
    items: menu.json.data.list.map((m) => ({ menu_item_id: m.id, quantity: 1 })),
  }, waiterToken);
  const id = created.json.data.id;
  await call('PATCH', `/api/orders/${id}/status`, { status: 'accepted' }, chefToken);
  await call('PATCH', `/api/orders/${id}/status`, { status: 'cooking' }, chefToken);

  const detail = await call('GET', `/api/orders/${id}`, null, chefToken);
  for (const t of detail.json.data.tasks) {
    const r = await call('PATCH', `/api/orders/tasks/${t.id}`, { status: 'done' }, chefToken);
    assert.strictEqual(r.status, 200);
  }
  const after = await call('GET', `/api/orders/${id}`, null, chefToken);
  assert.strictEqual(after.json.data.status, 'ready', '全部档口完成后应自动 ready');
});

test('档口任务非法状态返回 400', async () => {
  const detail = await call('GET', '/api/orders?status=cooking&pageSize=1', null, chefToken);
  const id = detail.json.data.list[0].id;
  const d = await call('GET', `/api/orders/${id}`, null, chefToken);
  const taskId = d.json.data.tasks[0].id;
  const bad = await call('PATCH', `/api/orders/tasks/${taskId}`, { status: 'flying' }, chefToken);
  assert.strictEqual(bad.status, 400);
});

// ---------- 看板与筛选 ----------
test('后厨看板按档口分列返回', async () => {
  const r = await call('GET', '/api/orders/board', null, chefToken);
  assert.strictEqual(r.status, 200);
  assert.ok(Array.isArray(r.json.data.columns));
  assert.strictEqual(r.json.data.columns.length, 4);
  assert.ok(r.json.data.columns[0].station.name);
});

test('订单列表按状态筛选生效', async () => {
  const r = await call('GET', '/api/orders?status=paid&pageSize=100', null, adminToken);
  assert.strictEqual(r.status, 200);
  for (const o of r.json.data.list) assert.strictEqual(o.status, 'paid');
  assert.ok(r.json.data.total > 0);
});

test('订单列表按档口筛选生效', async () => {
  const stations = await call('GET', '/api/entities/stations', null, adminToken);
  const sid = stations.json.data.list[0].id;
  const r = await call('GET', `/api/orders?station=${sid}&pageSize=100`, null, adminToken);
  assert.strictEqual(r.status, 200);
  assert.ok(r.json.data.list.every((o) => o.items.some((it) => it.station_id === sid)));
});

// ---------- 分页边界 ----------
test('分页边界：pageSize 上限被夹到 100', async () => {
  const r = await call('GET', '/api/orders?page=1&pageSize=9999', null, adminToken);
  assert.strictEqual(r.json.data.pageSize, 100);
});

test('分页边界：page=0 被纠正为 1', async () => {
  const r = await call('GET', '/api/orders?page=0&pageSize=5', null, adminToken);
  assert.strictEqual(r.json.data.page, 1);
});

test('分页边界：超出末页返回空列表但总数正确', async () => {
  const r = await call('GET', '/api/orders?page=9999&pageSize=10', null, adminToken);
  assert.strictEqual(r.json.data.list.length, 0);
  assert.ok(r.json.data.total > 0);
  assert.ok(r.json.data.pages > 0);
});

test('搜索：按订单号关键词命中', async () => {
  const first = await call('GET', '/api/orders?pageSize=1', null, adminToken);
  const no = first.json.data.list[0].order_no;
  const r = await call('GET', `/api/orders?q=${encodeURIComponent(no)}`, null, adminToken);
  assert.ok(r.json.data.total >= 1);
  assert.ok(r.json.data.list.some((o) => o.order_no === no));
});

// ---------- AI 降级与落库 ----------
test('AI 销量预测：未配置 Key 时 source=local 且写入 predicted_demand', async () => {
  const r = await call('POST', '/api/ai/forecast-demand', {}, adminToken);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.data.source, 'local', '未配置 LLM_API_KEY 应降级本地规则');
  assert.ok(r.json.data.updated >= 25);
  assert.ok(r.json.data.items.some((i) => i.predicted_demand > 0), '预测值应写入菜单');
  // 复核确实落库到 menu_items
  const one = await call('GET', `/api/entities/menu-items/${r.json.data.items[0].id}`, null, adminToken);
  assert.ok(one.json.data.predicted_demand > 0);
});

test('AI 备料清单：source=local 且按档口分组', async () => {
  const r = await call('POST', '/api/ai/prep-list', {}, chefToken);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.data.source, 'local');
  assert.ok(r.json.data.stations.length > 0);
  assert.ok(r.json.data.total_portions > 0);
});

test('AI 异常识别：source=local 且返回告警数组', async () => {
  const r = await call('POST', '/api/ai/detect-anomaly', {}, chefToken);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.data.source, 'local');
  assert.ok(Array.isArray(r.json.data.alerts));
  assert.ok(typeof r.json.data.total === 'number');
  assert.ok(r.json.data.thresholds.pending > 0);
});

test('AI 接口未登录返回 401', async () => {
  const r = await call('POST', '/api/ai/prep-list', {});
  assert.strictEqual(r.status, 401);
});

// ---------- 通用 CRUD ----------
test('菜品 CRUD：新增后可改可删', async () => {
  const cats = await call('GET', '/api/entities/categories', null, adminToken);
  const created = await call('POST', '/api/entities/menu-items', {
    name: '测试菜品' + Date.now(), category_id: cats.json.data.list[0].id, price: 19.9, prep_minutes: 8,
  }, adminToken);
  assert.strictEqual(created.status, 201);
  const id = created.json.data.id;

  const upd = await call('PUT', `/api/entities/menu-items/${id}`, { price: 29.9 }, adminToken);
  assert.strictEqual(upd.json.data.price, 29.9);

  const del = await call('DELETE', `/api/entities/menu-items/${id}`, null, adminToken);
  assert.strictEqual(del.status, 200);
  const gone = await call('GET', `/api/entities/menu-items/${id}`, null, adminToken);
  assert.strictEqual(gone.status, 404);
});

test('菜品新增缺少必填字段返回 400', async () => {
  const r = await call('POST', '/api/entities/menu-items', { price: 10 }, adminToken);
  assert.strictEqual(r.status, 400);
});

test('员工列表不返回密码字段', async () => {
  const r = await call('GET', '/api/staff', null, adminToken);
  assert.strictEqual(r.status, 200);
  for (const u of r.json.data) {
    assert.strictEqual(u.password, undefined);
    assert.ok(u.username);
  }
});
