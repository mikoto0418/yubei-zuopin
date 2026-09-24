// 端到端冒烟脚本（手工运行，不属于 npm test）
// 用法：先起后端 4104，再 node test/e2e-smoke.js
const B = 'http://127.0.0.1:4104/api';

async function req(m, p, body, tk) {
  const h = { 'Content-Type': 'application/json' };
  if (tk) h.Authorization = 'Bearer ' + tk;
  const r = await fetch(B + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = {};
  try { j = await r.json(); } catch (e) { /* ignore */ }
  return { s: r.status, d: j.data, m: j.message };
}
const log = (...a) => console.log(...a);
let fails = 0;
function check(label, ok, extra) {
  if (!ok) fails++;
  log(`${ok ? '✔' : '�’'} ${label}${extra !== undefined ? ' — ' + extra : ''}`);
}

(async () => {
  // 1. 登录
  const lz = await req('POST', '/auth/login', { username: 'zhangsan', password: '123456' });
  const lw = await req('POST', '/auth/login', { username: 'wangwu', password: '123456' });
  const la = await req('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  check('三个账号登录成功', lz.s === 200 && lw.s === 200 && la.s === 200, `${lz.s}/${lw.s}/${la.s}`);
  const tz = lz.d.token, tw = lw.d.token, ta = la.d.token;

  // 2. 分类树
  const cats = await req('GET', '/categories');
  const subCount = cats.d.categories.reduce((n, c) => n + c.children.length, 0);
  check('分类树 5 一级 + 15 二级', cats.d.categories.length === 5 && subCount === 15, `${cats.d.categories.length}/${subCount}`);
  const leaf = cats.d.categories[0].children[0];

  // 3. 发布商品（多图 + 叶子分类）
  const pub = await req('POST', '/items', {
    title: 'E2E 测试相机', description: '端到端测试用', price: 333,
    category_id: leaf.id, condition: '九成新', images: ['/e2e/a.png', '/e2e/b.png'],
  }, tz);
  const itemId = pub.d.item.id;
  check('发布商品：叶子分类 + 多图落库', pub.s === 200 && pub.d.item.category === leaf.name && pub.d.images.length === 2,
    `分类=${pub.d.item.category} 图=${pub.d.images.length}`);

  // 4. 下单 → 通知卖家
  const nBefore = await req('GET', '/notifications/unread-count', null, tz);
  const ord = await req('POST', '/orders', { item_id: itemId, remark: '周末面交' }, tw);
  const oid = ord.d.order.id;
  const nAfter = await req('GET', '/notifications/unread-count', null, tz);
  check('下单成功且卖家收到通知', ord.s === 200 && ord.d.order.status === '待确认' && nAfter.d.unread > nBefore.d.unread,
    `${ord.d.order.status}，未读 ${nBefore.d.unread}→${nAfter.d.unread}`);

  // 5. 主链路状态流转
  const t1 = await req('PATCH', `/orders/${oid}/status`, { status: '待发货' }, tz);
  const t2 = await req('PATCH', `/orders/${oid}/status`, { status: '待收货' }, tz);
  const t3 = await req('PATCH', `/orders/${oid}/status`, { status: '已完成' }, tw);
  check('状态机主链路 待确认→待发货→待收货→已完成',
    t1.d?.order?.status === '待发货' && t2.d?.order?.status === '待收货' && t3.d?.order?.status === '已完成',
    `${t1.d?.order?.status}→${t2.d?.order?.status}→${t3.d?.order?.status}`);

  // 6. 非法流转
  const bad1 = await req('PATCH', `/orders/${oid}/status`, { status: '待发货' }, tz);
  const bad2 = await req('PATCH', `/orders/${oid}/status`, { status: '不存在的状态' }, tz);
  check('终态再流转 400 / 非法状态值 400', bad1.s === 400 && bad2.s === 400, `${bad1.s}/${bad2.s}`);

  // 6b. 陌生人越权：另开一单，让第三方尝试流转
  const pubX = await req('POST', '/items', { title: 'E2E 越权商品', price: 30, category_id: leaf.id }, tz);
  const oX = await req('POST', '/orders', { item_id: pubX.d.item.id }, tw);
  const uStranger = 'stranger_' + Date.now().toString(36);
  const reg = await req('POST', '/auth/register', { username: uStranger, password: '123456' });
  const bad3 = await req('PATCH', `/orders/${oX.d.order.id}/status`, { status: '待发货' }, reg.d.token);
  check('陌生人越权流转 403', bad3.s === 403, `${bad3.s}`);

  // 7. 订单日志
  const det = await req('GET', `/orders/${oid}`, null, tw);
  const chain = det.d.logs.map((l) => l.to_status).join('→');
  check('订单日志写入完整（4 条，含操作者）',
    det.d.logs.length === 4 && chain === '待确认→待发货→待收货→已完成' && det.d.logs.every((l) => l.operator_nickname),
    `${det.d.logs.length} 条：${chain}`);

  // 8. 评价
  const rv = await req('POST', '/reviews', { order_id: oid, rating: 5, content: 'E2E 好评' }, tw);
  const rvDup = await req('POST', '/reviews', { order_id: oid, rating: 4 }, tw);
  const rvMine = await req('GET', '/reviews/mine?role=given', null, tw);
  check('评价提交 / 去重 / 查询', rv.s === 200 && rv.d.review.role === 'buyer' && rvDup.s === 409 && rvMine.d.reviews.length >= 1,
    `role=${rv.d.review.role} 信用分=${rv.d.credit_score} 重复=${rvDup.s}`);

  // 9. 举报 + 审核
  const rep = await req('POST', '/reports', { target_type: 'item', target_id: itemId, reason: '虚假描述', detail: 'E2E' }, tw);
  const rvA = await req('PATCH', `/reports/${rep.d.report.id}`, { status: 'approved', handle_note: 'E2E 已处理' }, ta);
  const itemAfterReport = await req('GET', `/items/${itemId}`);
  check('举报提交 → 管理员通过 → 商品下架',
    rep.s === 200 && rep.d.report.status === 'pending' && rvA.s === 200 && rvA.d.report.status === 'approved' && itemAfterReport.d.item.status === '下架',
    `举报=${rep.d.report.status} 审核=${rvA.d.report.status} 商品=${itemAfterReport.d.item.status}`);

  // 10. 通知中心
  const nt = await req('GET', '/notifications', null, tw);
  const ra = await req('PATCH', '/notifications/read-all', null, tw);
  check('通知列表 / 全部已读', nt.s === 200 && nt.d.total > 0 && nt.d.notifications[0].title && ra.d.unread === 0,
    `total=${nt.d.total} 未读=${nt.d.unread} 首条=「${nt.d.notifications[0].title}」`);

  // 11. 分类筛选（一级包含二级；用 status=all 以覆盖已售/下架）
  const byRoot = await req('GET', `/items?category_id=${cats.d.categories[0].id}&status=all&pageSize=60`);
  const byLeaf = await req('GET', `/items?category_id=${leaf.id}&status=all&pageSize=60`);
  check('一级分类筛选自动包含二级子分类', byRoot.d.total >= byLeaf.d.total && byLeaf.d.total > 0,
    `一级=${byRoot.d.total} 二级=${byLeaf.d.total}`);

  // 12. 退款分支
  const pub2 = await req('POST', '/items', { title: 'E2E 退款商品', price: 50, category_id: leaf.id }, tz);
  const o2 = await req('POST', '/orders', { item_id: pub2.d.item.id }, tw);
  await req('PATCH', `/orders/${o2.d.order.id}/status`, { status: '待发货' }, tz);
  const rf = await req('PATCH', `/orders/${o2.d.order.id}/status`, { status: '退款中' }, tw);
  const cl = await req('PATCH', `/orders/${o2.d.order.id}/status`, { status: '已取消' }, tz);
  const itemAfterRefund = await req('GET', `/items/${pub2.d.item.id}`);
  check('退款分支 待发货→退款中→已取消，商品回到在售',
    rf.d?.order?.status === '退款中' && cl.d?.order?.status === '已取消' && itemAfterRefund.d.item.status === '在售',
    `${rf.d?.order?.status}→${cl.d?.order?.status}，商品=${itemAfterRefund.d.item.status}`);

  // 13. 旧接口兼容
  const pub3 = await req('POST', '/items', { title: 'E2E 兼容商品', price: 20, category_id: leaf.id }, tz);
  const o3 = await req('POST', '/orders', { item_id: pub3.d.item.id }, tw);
  const legacy = await req('POST', `/orders/${o3.d.order.id}/confirm`, null, tz);
  check('旧 /confirm 接口仍可用（等价于流转到待发货）', legacy.s === 200, `${legacy.s}`);

  console.log(fails ? `\n✖ E2E 有 ${fails} 项失败` : '\n✔ E2E 全部通过');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('E2E 异常:', e); process.exit(1); });
