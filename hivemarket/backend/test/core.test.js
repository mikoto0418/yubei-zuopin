// HiveMarket 后端核心链路测试（node:test 内置，无需额外依赖）
// 运行：cd backend && npm test
// 说明：使用临时 SQLite 库，每次全新种子数据；通过真实 HTTP 请求验证。

// 在 require 任何业务模块前必须设置数据库路径，确保跑在独立临时库上
const os = require('os');
const path = require('path');
const fs = require('fs');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const DB_FILE = path.join(os.tmpdir(), `hivemarket-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.DB_PATH = DB_FILE;
// 置空而非 delete：dotenv 只填充"不存在"的键，留空字符串可阻止 .env 里的真实 Key 被加载，
// 从而稳定走本地保底分支（delete 会被随后的 dotenv.config() 重新填充）。
process.env.LLM_API_KEY = '';
process.env.PORT = '0';

const app = require('../src/index');
const db = require('../src/db');
let server, BASE;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      BASE = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  server.close();
  try { db.close(); } catch (_) {}
  try { fs.rmSync(DB_FILE, { force: true }); } catch (_) {}
  try { fs.rmSync(`${DB_FILE}-wal`, { force: true }); } catch (_) {}
  try { fs.rmSync(`${DB_FILE}-shm`, { force: true }); } catch (_) {}
});

async function req(method, p, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + p, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try { json = await res.json(); } catch (_) {}
  return { status: res.status, body: json, data: json.data };
}

let seq = 0;
const uname = (p) => `${p}_${Date.now().toString(36)}${seq++}`;

async function registerUser(prefix) {
  const u = uname(prefix);
  const r = await req('POST', '/api/auth/register', { username: u, password: '123456', nickname: u, campus: '东区' });
  return { u, token: r.data.token, id: r.data.user.id };
}

async function adminToken() {
  const r = await req('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  return r.data.token;
}

// 造一笔订单并推到指定状态，返回 { orderId, itemId, seller, buyer }
async function makeOrder(target = '待确认') {
  const seller = await registerUser('mk_s');
  const buyer = await registerUser('mk_b');
  const pub = await req('POST', '/api/items', {
    title: `测试商品${seq}`, description: '测试用', price: 88, category: '手机通讯', condition: '九成新',
  }, seller.token);
  const itemId = pub.data.item.id;
  const order = await req('POST', '/api/orders', { item_id: itemId }, buyer.token);
  const orderId = order.data.order.id;

  const seqStates = ['待发货', '待收货', '已完成'];
  const idx = seqStates.indexOf(target);
  for (let i = 0; i <= idx; i++) {
    const to = seqStates[i];
    const tk = to === '已完成' ? buyer.token : seller.token;
    const r = await req('PATCH', `/api/orders/${orderId}/status`, { status: to }, tk);
    assert.equal(r.status, 200, `预置状态到 ${to} 失败`);
  }
  return { orderId, itemId, seller, buyer };
}

// ---------- 1. 注册 / 登录 ----------
test('注册 + 登录 成功', async () => {
  const u = uname('reg');
  const reg = await req('POST', '/api/auth/register', { username: u, password: '123456' });
  assert.equal(reg.status, 200);
  assert.ok(reg.data.token);
  assert.equal(reg.data.user.username, u);

  const dup = await req('POST', '/api/auth/register', { username: u, password: 'abc123' });
  assert.equal(dup.status, 409);

  const login = await req('POST', '/api/auth/login', { username: u, password: '123456' });
  assert.equal(login.status, 200);
  assert.ok(login.data.token);

  const bad = await req('POST', '/api/auth/login', { username: u, password: 'wrong' });
  assert.equal(bad.status, 401);
});

// ---------- 2. RBAC：普通用户 403，admin 可访问 ----------
test('普通用户访问 admin 接口返回 403', async () => {
  const user = await registerUser('usr');
  const r = await req('GET', '/api/admin/stats', null, user.token);
  assert.equal(r.status, 403);
});

test('admin 可访问 admin 统计接口（含新增模块统计）', async () => {
  const login = await req('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  assert.equal(login.status, 200);
  const stats = await req('GET', '/api/admin/stats', null, login.data.token);
  assert.equal(stats.status, 200);
  assert.ok(stats.data.totals.totalUsers >= 4);
  assert.ok(Array.isArray(stats.data.revenueTrend));
  assert.ok(stats.data.topSellers.length >= 0);
  assert.equal(typeof stats.data.totals.totalReviews, 'number');
  assert.equal(typeof stats.data.totals.reportPending, 'number');
  assert.ok(Array.isArray(stats.data.orderStatusRows));
});

// ---------- 3. 商品 CRUD ----------
test('商品发布 → 详情(浏览计数) → 编辑 → 下架', async () => {
  const seller = await registerUser('seller');
  const pub = await req('POST', '/api/items', {
    title: '测试山地车', description: '好车', price: 199, category: '交通工具', condition: '八成新',
  }, seller.token);
  assert.equal(pub.status, 200);
  const itemId = pub.data.item.id;
  assert.equal(pub.data.item.status, '在售');

  const d1 = await req('GET', `/api/items/${itemId}`);
  assert.equal(d1.data.item.view_count, 1);
  const d2 = await req('GET', `/api/items/${itemId}`);
  assert.equal(d2.data.item.view_count, 2);

  const edit = await req('PUT', `/api/items/${itemId}`, { title: '测试山地车-改', price: 150 }, seller.token);
  assert.equal(edit.status, 200);
  assert.equal(edit.data.item.title, '测试山地车-改');
  assert.equal(edit.data.item.price, 150);

  const bad = await req('PUT', `/api/items/${itemId}`, { price: -5 }, seller.token);
  assert.equal(bad.status, 400);

  const other = await registerUser('hacker');
  const forbidden = await req('PUT', `/api/items/${itemId}`, { title: 'x' }, other.token);
  assert.equal(forbidden.status, 403);

  const off = await req('PATCH', `/api/items/${itemId}/status`, { status: '下架' }, seller.token);
  assert.equal(off.status, 200);

  // 搜索 + 分页字段（status=all 以免受刚下架的影响）
  const list = await req('GET', `/api/items?keyword=${encodeURIComponent('山地')}&status=all&page=1&pageSize=10`);
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.data.items));
  assert.ok(list.data.total >= 1);
  assert.ok(list.data.pages >= 1);
});

// ---------- 4. 订单状态机：主链路 ----------
test('订单主链路：待确认 → 待发货 → 待收货 → 已完成', async () => {
  const seller = await registerUser('seller2');
  const buyer = await registerUser('buyer2');

  const pub = await req('POST', '/api/items', { title: '二手耳机', price: 80, category: '数码电子' }, seller.token);
  const itemId = pub.data.item.id;

  const selfBuy = await req('POST', '/api/orders', { item_id: itemId }, seller.token);
  assert.equal(selfBuy.status, 400);

  const order = await req('POST', '/api/orders', { item_id: itemId }, buyer.token);
  assert.equal(order.status, 200);
  assert.equal(order.data.order.status, '待确认');
  const oid = order.data.order.id;

  const dupOrder = await req('POST', '/api/orders', { item_id: itemId }, buyer.token);
  assert.equal(dupOrder.status, 409);

  // 买家无权执行 待确认 → 待发货（只有卖家能确认）
  const buyerConfirm = await req('PATCH', `/api/orders/${oid}/status`, { status: '待发货' }, buyer.token);
  assert.equal(buyerConfirm.status, 403);

  // 卖家确认 → 商品置已售
  const confirm = await req('PATCH', `/api/orders/${oid}/status`, { status: '待发货' }, seller.token);
  assert.equal(confirm.status, 200);
  const itemAfter = await req('GET', `/api/items/${itemId}`);
  assert.equal(itemAfter.data.item.status, '已售');

  // 卖家不能直接跳到已完成（状态机不允许跨状态）
  const skip = await req('PATCH', `/api/orders/${oid}/status`, { status: '已完成' }, seller.token);
  assert.equal(skip.status, 400);

  // 待发货状态下，买家无权替卖家发货（合法边但越权 → 403）
  const buyerShip = await req('PATCH', `/api/orders/${oid}/status`, { status: '待收货' }, buyer.token);
  assert.equal(buyerShip.status, 403);

  // 卖家发货 → 待收货
  const ship = await req('PATCH', `/api/orders/${oid}/status`, { status: '待收货' }, seller.token);
  assert.equal(ship.status, 200);

  // 买家不能代替卖家重复发货（同状态 no-op → 400）
  const buyerShipAgain = await req('PATCH', `/api/orders/${oid}/status`, { status: '待收货' }, buyer.token);
  assert.equal(buyerShipAgain.status, 400);

  // 买家确认收货 → 已完成
  const complete = await req('PATCH', `/api/orders/${oid}/status`, { status: '已完成' }, buyer.token);
  assert.equal(complete.status, 200);

  const mine = await req('GET', '/api/orders/mine?role=buy', null, buyer.token);
  const found = mine.data.orders.find((o) => o.id === oid);
  assert.equal(found.status, '已完成');

  // 终态不可再流转
  const again = await req('PATCH', `/api/orders/${oid}/status`, { status: '已完成' }, buyer.token);
  assert.equal(again.status, 400);

  // 兼容旧接口仍可用（已完成 → 任何流转都 400）
  const legacy = await req('POST', `/api/orders/${oid}/complete`, null, buyer.token);
  assert.equal(legacy.status, 400);
});

// ---------- 5. 状态机：非法流转与越权 ----------
test('非法流转返回 400，未注册状态返回 400', async () => {
  const { orderId, buyer } = await makeOrder('待确认');

  // 待确认 不能直接到 待收货
  const bad = await req('PATCH', `/api/orders/${orderId}/status`, { status: '待收货' }, buyer.token);
  assert.equal(bad.status, 400);
  assert.ok(Array.isArray(bad.body.allowed), '应返回允许的下一状态列表');

  // 完全不存在的状态
  const bogus = await req('PATCH', `/api/orders/${orderId}/status`, { status: '已发货' }, buyer.token);
  assert.equal(bogus.status, 400);

  // 陌生人操作
  const stranger = await registerUser('stranger');
  const denied = await req('PATCH', `/api/orders/${orderId}/status`, { status: '已取消' }, stranger.token);
  assert.equal(denied.status, 403);
});

// ---------- 6. 退款分支：待发货 → 退款中 → 已取消 ----------
test('退款分支：待发货 → 退款中 → 已取消，商品回到在售', async () => {
  const { orderId, itemId, seller, buyer } = await makeOrder('待发货');

  // 只有买家能发起退款
  const sellerRefund = await req('PATCH', `/api/orders/${orderId}/status`, { status: '退款中' }, seller.token);
  assert.equal(sellerRefund.status, 403);

  const refund = await req('PATCH', `/api/orders/${orderId}/status`, { status: '退款中' }, buyer.token);
  assert.equal(refund.status, 200);
  assert.equal(refund.data.order.status, '退款中');

  // 退款中不能直接完成
  const finish = await req('PATCH', `/api/orders/${orderId}/status`, { status: '已完成' }, buyer.token);
  assert.equal(finish.status, 400);

  // 卖家同意退款 → 已取消
  const close = await req('PATCH', `/api/orders/${orderId}/status`, { status: '已取消' }, seller.token);
  assert.equal(close.status, 200);

  const item = await req('GET', `/api/items/${itemId}`);
  assert.equal(item.data.item.status, '在售');
});

// ---------- 7. 取消订单 ----------
test('下单后买家可取消（待确认 → 已取消）', async () => {
  const seller = await registerUser('seller3');
  const buyer = await registerUser('buyer3');
  const pub = await req('POST', '/api/items', { title: 'x仓鼠笼', price: 30, category: '生活百货' }, seller.token);
  const itemId = pub.data.item.id;
  const order = await req('POST', '/api/orders', { item_id: itemId }, buyer.token);
  const oid = order.data.order.id;
  const cancel = await req('PATCH', `/api/orders/${oid}/status`, { status: '已取消' }, buyer.token);
  assert.equal(cancel.status, 200);
  assert.equal(cancel.data.order.status, '已取消');
});

// ---------- 8. 订单日志与详情时间轴 ----------
test('订单详情返回流转日志与操作者，且每次流转写日志', async () => {
  const { orderId, buyer } = await makeOrder('待收货');

  const detail = await req('GET', `/api/orders/${orderId}`, null, buyer.token);
  assert.equal(detail.status, 200);
  assert.equal(detail.data.order.status, '待收货');
  assert.ok(detail.data.logs.length >= 3, '待收货应至少有 3 条日志');

  const tos = detail.data.logs.map((l) => l.to_status);
  assert.deepEqual(tos.slice(0, 3), ['待确认', '待发货', '待收货']);
  assert.equal(detail.data.logs[0].from_status, null, '首条日志 from_status 应为 null');
  assert.ok(detail.data.logs.every((l) => l.remark && l.remark.length > 0), '每条日志都应有说明文案');
  assert.ok(detail.data.logs.some((l) => l.operator_nickname), '日志应带操作者昵称');

  const logged = db.prepare('SELECT COUNT(*) AS c FROM order_logs WHERE order_id = ?').get(orderId).c;
  assert.equal(logged, detail.data.logs.length);

  // 非参与方不可见
  const outsider = await registerUser('outsider');
  const denied = await req('GET', `/api/orders/${orderId}`, null, outsider.token);
  assert.equal(denied.status, 403);
});

// ---------- 9. 评价：约束与提交 ----------
test('评价：未完成不可评、完成后可评、每单一次、非参与方 403', async () => {
  const { orderId, seller, buyer } = await makeOrder('待收货');

  const tooEarly = await req('POST', '/api/reviews', { order_id: orderId, rating: 5, content: '太早' }, buyer.token);
  assert.equal(tooEarly.status, 400);

  await req('PATCH', `/api/orders/${orderId}/status`, { status: '已完成' }, buyer.token);

  const badRating = await req('POST', '/api/reviews', { order_id: orderId, rating: 9 }, buyer.token);
  assert.equal(badRating.status, 400);

  const ok = await req('POST', '/api/reviews', { order_id: orderId, rating: 5, content: '卖家人很好' }, buyer.token);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.review.role, 'buyer');
  assert.equal(ok.data.review.reviewee_id, seller.id);
  assert.ok(ok.data.credit_score >= 100);

  const dup = await req('POST', '/api/reviews', { order_id: orderId, rating: 4 }, buyer.token);
  assert.equal(dup.status, 409);

  // 卖家回评（双向评价）
  const back = await req('POST', '/api/reviews', { order_id: orderId, rating: 4, content: '买家不错' }, seller.token);
  assert.equal(back.status, 200);
  assert.equal(back.data.review.role, 'seller');

  // 非参与方
  const outsider = await registerUser('rv_out');
  const denied = await req('POST', '/api/reviews', { order_id: orderId, rating: 5 }, outsider.token);
  assert.equal(denied.status, 403);

  // 评价后订单详情不再允许评价
  const detail = await req('GET', `/api/orders/${orderId}`, null, buyer.token);
  assert.equal(detail.data.canReview, false);
  assert.ok(detail.data.myReview);
});

// ---------- 10. 评价：查询与统计 ----------
test('评价查询：我给出的 / 我收到的 与公开列表统计', async () => {
  const { orderId, seller, buyer } = await makeOrder('已完成');
  await req('POST', '/api/reviews', { order_id: orderId, rating: 5, content: '好评' }, buyer.token);
  await req('POST', '/api/reviews', { order_id: orderId, rating: 3, content: '一般' }, seller.token);

  const given = await req('GET', '/api/reviews/mine?role=given', null, buyer.token);
  assert.equal(given.status, 200);
  assert.equal(given.data.role, 'given');
  assert.ok(given.data.reviews.some((r) => r.order_id === orderId));
  assert.ok(given.data.summary.given >= 1);

  const received = await req('GET', '/api/reviews/mine?role=received', null, seller.token);
  assert.equal(received.status, 200);
  assert.ok(received.data.reviews.some((r) => r.order_id === orderId));
  assert.ok(received.data.summary.received >= 1);

  const pub = await req('GET', `/api/reviews?userId=${seller.id}&role=received`);
  assert.equal(pub.status, 200);
  assert.ok(pub.data.total >= 1);
  assert.ok(pub.data.summary.avg > 0);

  // 待评价列表：卖家评过之后不应再出现该订单
  const pending = await req('GET', '/api/reviews/pending', null, seller.token);
  assert.equal(pending.status, 200);
  assert.ok(!pending.data.orders.some((o) => o.id === orderId));
});

// ---------- 11. 举报：提交与校验 ----------
test('举报：提交成功、重复举报 409、举报自己 400、原因非法 400', async () => {
  const seller = await registerUser('rp_s');
  const reporter = await registerUser('rp_r');
  const pub = await req('POST', '/api/items', { title: '被举报商品', price: 10, category: '数码电子' }, seller.token);
  const itemId = pub.data.item.id;

  const self = await req('POST', '/api/reports', {
    target_type: 'item', target_id: itemId, reason: '虚假描述',
  }, seller.token);
  assert.equal(self.status, 400);

  const badReason = await req('POST', '/api/reports', {
    target_type: 'item', target_id: itemId, reason: '看不顺眼',
  }, reporter.token);
  assert.equal(badReason.status, 400);

  const badType = await req('POST', '/api/reports', {
    target_type: 'order', target_id: itemId, reason: '虚假描述',
  }, reporter.token);
  assert.equal(badType.status, 400);

  const ok = await req('POST', '/api/reports', {
    target_type: 'item', target_id: itemId, reason: '虚假描述', detail: '与描述不符',
  }, reporter.token);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.report.status, 'pending');

  const dup = await req('POST', '/api/reports', {
    target_type: 'item', target_id: itemId, reason: '虚假描述',
  }, reporter.token);
  assert.equal(dup.status, 409);

  const mine = await req('GET', '/api/reports', null, reporter.token);
  assert.equal(mine.status, 200);
  assert.ok(mine.data.reports.some((r) => r.target_id === itemId));
  assert.ok(typeof mine.data.counts.pending === 'number');
});

// ---------- 12. 举报：管理员审核 ----------
test('举报审核：普通用户 403，管理员通过后商品下架并通知举报人', async () => {
  const seller = await registerUser('rp2_s');
  const reporter = await registerUser('rp2_r');
  const pub = await req('POST', '/api/items', { title: '待下架商品', price: 10, category: '数码电子' }, seller.token);
  const itemId = pub.data.item.id;
  const rep = await req('POST', '/api/reports', {
    target_type: 'item', target_id: itemId, reason: '违禁物品', detail: '疑似违规',
  }, reporter.token);
  const reportId = rep.data.report.id;

  const asUser = await req('PATCH', `/api/reports/${reportId}`, { status: 'approved' }, reporter.token);
  assert.equal(asUser.status, 403);

  const tk = await adminToken();
  const badStatus = await req('PATCH', `/api/reports/${reportId}`, { status: 'pending' }, tk);
  assert.equal(badStatus.status, 400);

  const approve = await req('PATCH', `/api/reports/${reportId}`, { status: 'approved', handle_note: '已核实' }, tk);
  assert.equal(approve.status, 200);
  assert.equal(approve.data.report.status, 'approved');

  const item = await req('GET', `/api/items/${itemId}`);
  assert.equal(item.data.item.status, '下架');

  const again = await req('PATCH', `/api/reports/${reportId}`, { status: 'rejected' }, tk);
  assert.equal(again.status, 400, '已处理的举报不能重复审核');

  // 举报人收到处理通知
  const notif = await req('GET', '/api/notifications?unread=1', null, reporter.token);
  assert.ok(notif.data.notifications.some((n) => n.type === 'report'));

  // 管理员可看全部举报
  const all = await req('GET', '/api/reports?all=1', null, tk);
  assert.equal(all.status, 200);
  assert.ok(all.data.reports.length >= 1);
});

// ---------- 13. 举报用户：审核通过扣信用分 ----------
test('举报用户审核通过后扣除被举报人信用分', async () => {
  const target = await registerUser('rp3_t');
  const reporter = await registerUser('rp3_r');
  const before = db.prepare('SELECT credit_score FROM users WHERE id = ?').get(target.id).credit_score;

  const rep = await req('POST', '/api/reports', {
    target_type: 'user', target_id: target.id, reason: '恶意骚扰', detail: '频繁骚扰',
  }, reporter.token);
  assert.equal(rep.status, 200);

  const tk = await adminToken();
  const approve = await req('PATCH', `/api/reports/${rep.data.report.id}`, { status: 'approved' }, tk);
  assert.equal(approve.status, 200);

  const after = db.prepare('SELECT credit_score FROM users WHERE id = ?').get(target.id).credit_score;
  assert.equal(after, Math.max(before - 10, 0));
});

// ---------- 14. 通知：生成 / 未读角标 / 已读 ----------
test('通知：下单触发通知、未读角标、单条已读与全部已读', async () => {
  const seller = await registerUser('nt_s');
  const buyer = await registerUser('nt_b');
  const pub = await req('POST', '/api/items', { title: '通知测试商品', price: 20, category: '数码电子' }, seller.token);
  const itemId = pub.data.item.id;

  const before = await req('GET', '/api/notifications/unread-count', null, seller.token);
  assert.equal(before.status, 200);
  assert.equal(before.data.unread, 0);

  await req('POST', '/api/orders', { item_id: itemId }, buyer.token);

  const after = await req('GET', '/api/notifications/unread-count', null, seller.token);
  assert.ok(after.data.unread >= 1, '下单后卖家应有未读通知');

  const list = await req('GET', '/api/notifications?unread=1', null, seller.token);
  assert.equal(list.status, 200);
  assert.ok(list.data.notifications.length >= 1);
  assert.ok(list.data.notifications.every((n) => n.read === 0));
  assert.ok(list.data.pages >= 1);

  const first = list.data.notifications[0];
  const read = await req('PATCH', `/api/notifications/${first.id}/read`, null, seller.token);
  assert.equal(read.status, 200);

  // 重复标记已读仍返回 200（幂等）
  const readAgain = await req('PATCH', `/api/notifications/${first.id}/read`, null, seller.token);
  assert.equal(readAgain.status, 200);

  const allRead = await req('PATCH', '/api/notifications/read-all', null, seller.token);
  assert.equal(allRead.status, 200);
  assert.equal(allRead.data.unread, 0);

  const finalCount = await req('GET', '/api/notifications/unread-count', null, seller.token);
  assert.equal(finalCount.data.unread, 0);
});

test('通知：无权操作他人通知', async () => {
  const a = await registerUser('nt2_a');
  const b = await registerUser('nt2_b');
  const pub = await req('POST', '/api/items', { title: '通知越权商品', price: 20, category: '数码电子' }, a.token);
  await req('POST', '/api/orders', { item_id: pub.data.item.id }, b.token);

  const list = await req('GET', '/api/notifications', null, a.token);
  const mine = list.data.notifications[0];
  assert.ok(mine);

  const other = await registerUser('nt2_c');
  const denied = await req('PATCH', `/api/notifications/${mine.id}/read`, null, other.token);
  assert.equal(denied.status, 403);

  const notFound = await req('PATCH', '/api/notifications/99999999/read', null, a.token);
  assert.equal(notFound.status, 404);
});

// ---------- 15. 分类树 ----------
test('分类树：5 个一级 + 15 个二级，且带商品数', async () => {
  const tree = await req('GET', '/api/categories');
  assert.equal(tree.status, 200);
  assert.equal(tree.data.categories.length, 5, '应有 5 个一级分类');
  const subs = tree.data.categories.reduce((n, c) => n + c.children.length, 0);
  assert.equal(subs, 15, '应有 15 个二级分类');
  assert.ok(tree.data.flat.length === 20);

  const one = await req('GET', `/api/categories/${tree.data.categories[0].id}`);
  assert.equal(one.status, 200);
  assert.ok(one.data.category.children.length >= 1);

  const missing = await req('GET', '/api/categories/999999');
  assert.equal(missing.status, 404);

  // 旧前端兼容字段
  const legacy = await req('GET', '/api/items/categories');
  assert.equal(legacy.status, 200);
  assert.ok(Array.isArray(legacy.data.categories));
  assert.ok(Array.isArray(legacy.data.tree));
});

test('按一级分类筛选商品会自动包含二级子分类', async () => {
  const tree = await req('GET', '/api/categories');
  const digital = tree.data.categories.find((c) => c.name === '数码电子');
  assert.ok(digital);

  const byRoot = await req('GET', `/api/items?category_id=${digital.id}&pageSize=60`);
  assert.equal(byRoot.status, 200);
  assert.ok(byRoot.data.total > 0, '数码电子下应有商品');

  const childId = digital.children[0].id;
  const byChild = await req('GET', `/api/items?category_id=${childId}&pageSize=60`);
  assert.ok(byChild.data.total > 0);
  assert.ok(byChild.data.total <= byRoot.data.total, '子分类商品数不应超过父分类');
});

// ---------- 16. 商品多图 ----------
test('商品多图：种子带图、发布可带图、追加图并同步 images 字段', async () => {
  const seller = await registerUser('img_s');
  const pub = await req('POST', '/api/items', {
    title: '多图测试商品', price: 50, category: '手机通讯', images: ['/a.png', '/b.png'],
  }, seller.token);
  assert.equal(pub.status, 200);
  const itemId = pub.data.item.id;
  assert.equal(pub.data.images.length, 2);

  const add = await req('POST', `/api/items/${itemId}/images`, { images: ['/c.png', '/d.png'] }, seller.token);
  assert.equal(add.status, 200);
  assert.equal(add.data.images.length, 4);

  const empty = await req('POST', `/api/items/${itemId}/images`, { images: [] }, seller.token);
  assert.equal(empty.status, 400);

  const other = await registerUser('img_o');
  const denied = await req('POST', `/api/items/${itemId}/images`, { images: ['/x.png'] }, other.token);
  assert.equal(denied.status, 403);

  const detail = await req('GET', `/api/items/${itemId}`);
  assert.equal(detail.data.images.length, 4);
  assert.equal(typeof detail.data.seller.review_count, 'number');
  assert.ok(detail.data.item.images.split(',').length === 4, 'items.images 应同步为逗号串');
});

// ---------- 17. 种子数据规模 ----------
test('种子数据满足规格：40 商品 / 25 订单 / 6 状态 / 评价 / 举报 / 通知', async () => {
  const counts = {
    items: db.prepare('SELECT COUNT(*) AS c FROM items').get().c,
    orders: db.prepare('SELECT COUNT(*) AS c FROM orders').get().c,
    logs: db.prepare('SELECT COUNT(*) AS c FROM order_logs').get().c,
    reviews: db.prepare('SELECT COUNT(*) AS c FROM reviews').get().c,
    reports: db.prepare('SELECT COUNT(*) AS c FROM reports').get().c,
    notifications: db.prepare('SELECT COUNT(*) AS c FROM notifications').get().c,
    categories: db.prepare('SELECT COUNT(*) AS c FROM categories').get().c,
    itemImages: db.prepare('SELECT COUNT(*) AS c FROM item_images').get().c,
  };
  assert.ok(counts.items >= 40, `商品应 ≥40，实际 ${counts.items}`);
  assert.ok(counts.orders >= 25, `订单应 ≥25，实际 ${counts.orders}`);
  assert.ok(counts.logs >= 35, `订单日志应 ≥35，实际 ${counts.logs}`);
  assert.ok(counts.reviews >= 15, `评价应 ≥15，实际 ${counts.reviews}`);
  assert.ok(counts.reports >= 10, `举报应 ≥10，实际 ${counts.reports}`);
  assert.ok(counts.notifications >= 30, `通知应 ≥30，实际 ${counts.notifications}`);
  assert.equal(counts.categories, 20);
  assert.ok(counts.itemImages >= 40, '每件商品至少一张图');

  // 覆盖 6 种订单状态
  const statuses = db.prepare('SELECT DISTINCT status FROM orders').all().map((r) => r.status).sort();
  assert.deepEqual(
    statuses,
    ['待发货', '待确认', '待收货', '已完成', '已取消', '退款中'].sort()
  );

  // 时间跨度 ≥14 天
  const span = db.prepare(
    "SELECT CAST(julianday(MAX(created_at)) - julianday(MIN(created_at)) AS INTEGER) AS d FROM orders"
  ).get().d;
  assert.ok(span >= 14, `订单时间跨度应 ≥14 天，实际 ${span}`);

  // 商品都挂在叶子分类上（category_id 非空）
  const orphan = db.prepare('SELECT COUNT(*) AS c FROM items WHERE category_id IS NULL').get().c;
  assert.equal(orphan, 0, '所有商品都应挂到叶子分类');
});

// ---------- 18. 分页边界 ----------
test('分页边界：pageSize 上限、page 超界返回空、非法参数回落默认值', async () => {
  const big = await req('GET', '/api/items?page=1&pageSize=999');
  assert.equal(big.status, 200);
  assert.equal(big.data.pageSize, 60, 'pageSize 应被夹到上限 60');

  const over = await req('GET', '/api/items?page=9999&pageSize=10');
  assert.equal(over.status, 200);
  assert.equal(over.data.items.length, 0);

  const bad = await req('GET', '/api/items?page=abc&pageSize=-3');
  assert.equal(bad.status, 200);
  assert.equal(bad.data.page, 1);
  assert.ok(bad.data.pageSize >= 1);

  const notif = await req('GET', '/api/notifications?page=1&pageSize=9999', null, (await adminToken()));
  assert.equal(notif.status, 200);
  assert.ok(notif.data.pageSize <= 100);
});

// ---------- 19. AI 上架文案保底 ----------
test('AI 商品描述未配置 Key 时返回本地保底（source=local）', async () => {
  const user = await registerUser('ai');
  const r = await req('POST', '/api/ai/item-desc', {
    title: '全新机械键盘', category: '数码电子', keywords: ['青轴', 'RGB', '低价'], price: 150,
  }, user.token);
  assert.equal(r.status, 200);
  assert.ok(r.data.description.length > 10, '本地模板应返回非空描述');
  assert.equal(r.data.source, 'local');
});

// ---------- 20. 求购 / 收藏 / IM ----------
test('求购发布与删除、收藏切换、AI 推荐、IM 会话', async () => {
  const seller = await registerUser('seller4');
  const buyer = await registerUser('buyer4');

  const want = await req('POST', '/api/wants', { title: '求购一台 iPad', budget: 2000, description: '成色好' }, buyer.token);
  assert.equal(want.status, 200);

  const pub = await req('POST', '/api/items', { title: 'ipad关注商品', price: 66, category: '数码电子' }, seller.token);
  const itemId = pub.data.item.id;

  const fav1 = await req('POST', '/api/favorites/toggle', { item_id: itemId }, buyer.token);
  assert.equal(fav1.data.favorited, true);
  const fav2 = await req('POST', '/api/favorites/toggle', { item_id: itemId }, buyer.token);
  assert.equal(fav2.data.favorited, false);

  const rec = await req('GET', '/api/ai/recommend', null, buyer.token);
  assert.equal(rec.status, 200);
  assert.ok(Array.isArray(rec.data.items));

  const conv = await req('POST', '/api/messages/start', { item_id: itemId, seller_id: seller.id, content: '你好还有吗' }, buyer.token);
  assert.equal(conv.status, 200);
  const convId = conv.data.conversation.id;
  const send = await req('POST', `/api/messages/conversations/${convId}/messages`, { content: '在吗？' }, seller.token);
  assert.equal(send.status, 200);

  const list = await req('GET', '/api/messages/conversations', null, seller.token);
  const c = list.data.conversations.find((x) => x.id === convId);
  assert.ok(c.unread >= 1);

  const delWant = await req('DELETE', `/api/wants/${want.data.want.id}`, null, buyer.token);
  assert.equal(delWant.status, 200);
});

test('IM 消息会生成通知给对方', async () => {
  const seller = await registerUser('im_s');
  const buyer = await registerUser('im_b');
  const pub = await req('POST', '/api/items', { title: 'IM通知商品', price: 66, category: '数码电子' }, seller.token);

  await req('POST', '/api/messages/start', { item_id: pub.data.item.id, seller_id: seller.id, content: '在吗' }, buyer.token);

  const notif = await req('GET', '/api/notifications?unread=1', null, seller.token);
  assert.ok(notif.data.notifications.some((n) => n.type === 'message'), '卖家应收到消息通知');
});

// ---------- 21. 404 ----------
test('未知接口返回 404', async () => {
  const r = await req('GET', '/api/not-exist-route');
  assert.equal(r.status, 404);
});

test('不存在的订单/评价/举报返回 404', async () => {
  const u = await registerUser('nf');
  const o = await req('GET', '/api/orders/999999', null, u.token);
  assert.equal(o.status, 404);
  const rep = await req('GET', '/api/reports/999999', null, u.token);
  assert.equal(rep.status, 404);
  const item = await req('GET', '/api/items/999999');
  assert.equal(item.status, 404);
});
