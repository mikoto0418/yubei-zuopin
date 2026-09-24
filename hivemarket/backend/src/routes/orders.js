const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { notify } = require('../services/notify');
const fsm = require('../services/orderState');

const router = express.Router();

function orderDetail(id) {
  return db.prepare(
    `SELECT o.*, it.title AS item_title, it.images AS item_images, it.category AS item_category,
            bu.nickname AS buyer_nickname, bu.campus AS buyer_campus,
            se.nickname AS seller_nickname, se.campus AS seller_campus
     FROM orders o
     JOIN items it ON o.item_id = it.id
     JOIN users bu ON o.buyer_id = bu.id
     JOIN users se ON o.seller_id = se.id
     WHERE o.id = ?`
  ).get(id);
}

// 下单：买方购买在售商品
router.post('/', auth, (req, res) => {
  const { item_id, remark = '' } = req.body || {};
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(item_id);
  if (!item) return res.status(404).json({ message: '商品不存在' });
  if (item.seller_id === req.userId) return res.status(400).json({ message: '不能购买自己的商品' });
  if (item.status !== '在售') return res.status(400).json({ message: '该商品当前不可购买' });

  const pending = db.prepare(
    'SELECT id FROM orders WHERE item_id = ? AND buyer_id = ? AND status IN (?, ?)'
  ).get(item.id, req.userId, '待确认', '待发货');
  if (pending) return res.status(409).json({ message: '你已对该商品下过单，等待卖家确认中' });

  const info = db.prepare(
    "INSERT INTO orders (item_id, buyer_id, seller_id, amount, status, remark, updated_at) VALUES (?, ?, ?, ?, '待确认', ?, datetime('now','localtime'))"
  ).run(item.id, req.userId, item.seller_id, item.price, String(remark || ''));

  db.prepare(
    'INSERT INTO order_logs (order_id, from_status, to_status, operator_id, remark) VALUES (?, NULL, ?, ?, ?)'
  ).run(info.lastInsertRowid, '待确认', req.userId, '买家提交订单');

  notify(item.seller_id, {
    type: 'order',
    title: '你有新的订单',
    body: `买家已下单「${item.title}」，请及时确认。`,
    link: '/orders',
  });

  const order = orderDetail(info.lastInsertRowid);
  res.json({ message: '下单成功', order });
});

// 我的订单（作为买家或卖家）：?role=buy|sell&status=xxx&page=&pageSize=
router.get('/mine', auth, (req, res) => {
  const { role, status } = req.query;
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
  const where = [];
  const params = [];
  if (role === 'sell') { where.push('o.seller_id = ?'); params.push(req.userId); }
  else { where.push('o.buyer_id = ?'); params.push(req.userId); }
  if (status && fsm.isStatus(status)) { where.push('o.status = ?'); params.push(status); }
  const whereSql = ` WHERE ${where.join(' AND ')}`;

  const total = db.prepare(`SELECT COUNT(*) AS c FROM orders o${whereSql}`).get(...params).c;
  const orders = db.prepare(
    `SELECT o.*, it.title AS item_title, it.images AS item_images,
            bu.nickname AS buyer_nickname, se.nickname AS seller_nickname
     FROM orders o
     JOIN items it ON o.item_id = it.id
     JOIN users bu ON o.buyer_id = bu.id
     JOIN users se ON o.seller_id = se.id${whereSql}
     ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, (page - 1) * pageSize);
  res.json({ orders, total, page, pageSize, pages: Math.ceil(total / pageSize) || 1 });
});

// 订单详情：含流转日志时间轴与可否评价
router.get('/:id', auth, (req, res) => {
  const order = orderDetail(req.params.id);
  if (!order) return res.status(404).json({ message: '订单不存在' });
  const relation = fsm.relationOf(order, req.userId, req.role);
  if (relation === 'stranger') return res.status(403).json({ message: '无权查看该订单' });

  const logs = db.prepare(
    `SELECT l.*, u.nickname AS operator_nickname
     FROM order_logs l LEFT JOIN users u ON l.operator_id = u.id
     WHERE l.order_id = ? ORDER BY l.created_at ASC, l.id ASC`
  ).all(order.id);
  const myReview = db.prepare(
    'SELECT * FROM reviews WHERE order_id = ? AND reviewer_id = ?'
  ).get(order.id, req.userId);

  res.json({
    order,
    logs,
    relation,
    nextStatuses: fsm.nextStatuses(order.status),
    canReview: order.status === '已完成' && !myReview,
    myReview: myReview || null,
  });
});

// 订单状态流转（状态机强校验：非法流转 400，越权 403）
// 同时挂到 PATCH /:id/status 与旧的 POST /:id/confirm|complete|cancel 上
function transition(req, res, forced) {
  const to = forced || (req.body || {}).status;
  const remark = (req.body || {}).remark;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ message: '订单不存在' });

  if (!fsm.isStatus(to)) return res.status(400).json({ message: `订单状态不合法：${to}` });
  const relation = fsm.relationOf(order, req.userId, req.role);
  if (relation === 'stranger') return res.status(403).json({ message: '无权操作该订单' });

  const from = order.status;
  if (from === to) return res.status(400).json({ message: `订单已处于「${to}」状态` });
  if (!fsm.canTransit(from, to)) {
    return res.status(400).json({
      message: `不允许的状态流转：${from} → ${to}`,
      allowed: fsm.nextStatuses(from),
    });
  }
  if (!fsm.actorAllowed(from, to, relation)) {
    return res.status(403).json({ message: `当前身份（${relation}）无权执行 ${from} → ${to}` });
  }

  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(order.item_id);
  db.transaction(() => {
    db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(to, order.id);
    db.prepare(
      'INSERT INTO order_logs (order_id, from_status, to_status, operator_id, remark) VALUES (?, ?, ?, ?, ?)'
    ).run(order.id, from, to, req.userId, fsm.remarkFor(from, to, remark));

    // 商品状态联动：确认发货 -> 已售；取消/退款 -> 回到在售
    if (to === '待发货') db.prepare("UPDATE items SET status = '已售' WHERE id = ?").run(order.item_id);
    if (to === '已取消' && item) db.prepare("UPDATE items SET status = '在售' WHERE id = ?").run(order.item_id);
  })();

  // 通知对方
  const title = item ? item.title : '订单';
  const link = '/orders';
  if (to === '待发货') {
    notify(order.buyer_id, { type: 'order', title: '卖家已确认订单', body: `「${title}」等待发货。`, link });
  } else if (to === '待收货') {
    notify(order.buyer_id, { type: 'order', title: '卖家已发货', body: `「${title}」等待你确认收货。`, link });
  } else if (to === '已完成') {
    notify(order.seller_id, { type: 'order', title: '交易已完成', body: `「${title}」买家已确认收货，快去评价对方吧。`, link });
    notify(order.buyer_id, { type: 'order', title: '交易已完成', body: `「${title}」交易完成，欢迎评价卖家。`, link });
  } else if (to === '退款中') {
    notify(order.seller_id, { type: 'order', title: '买家申请退款', body: `「${title}」买家发起退款，请尽快处理。`, link });
  } else if (to === '已取消') {
    const other = relation === 'buyer' ? order.seller_id : order.buyer_id;
    notify(other, { type: 'order', title: '订单已取消', body: `「${title}」订单已关闭。`, link });
  }

  const updated = orderDetail(order.id);
  const logs = db.prepare('SELECT * FROM order_logs WHERE order_id = ? ORDER BY id').all(order.id);
  res.json({ message: `订单状态已更新为「${to}」`, order: updated, logs });
}

router.patch('/:id/status', auth, (req, res) => transition(req, res));

// ---------- 兼容旧接口：等价于状态机的一次流转 ----------
router.post('/:id/confirm', auth, (req, res) => transition(req, res, '待发货'));
router.post('/:id/complete', auth, (req, res) => transition(req, res, '已完成'));
router.post('/:id/cancel', auth, (req, res) => transition(req, res, '已取消'));

module.exports = router;
