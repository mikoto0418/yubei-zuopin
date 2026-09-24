const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { notify } = require('../services/notify');

const router = express.Router();

// 信用分重算：100 + 好评(+2) / 中评(0) / 差评(-3)
function recalcCredit(userId) {
  const row = db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN rating >= 4 THEN 2 WHEN rating = 3 THEN 0 ELSE -3 END), 0) AS delta
     FROM reviews WHERE reviewee_id = ?`
  ).get(userId);
  db.prepare('UPDATE users SET credit_score = ? WHERE id = ?').run(100 + row.delta, userId);
  return 100 + row.delta;
}

// 某用户的评价列表（收到的）：?userId=&role=received|given&page=&pageSize=
router.get('/', (req, res) => {
  const userId = Number(req.query.userId) || 0;
  const role = req.query.role === 'given' ? 'given' : 'received';
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
  if (!userId) return res.status(400).json({ message: '请提供 userId' });

  const col = role === 'given' ? 'r.reviewer_id' : 'r.reviewee_id';
  const whereSql = ` WHERE ${col} = ?`;
  const total = db.prepare(`SELECT COUNT(*) AS c FROM reviews r${whereSql}`).get(userId).c;
  const reviews = db.prepare(
    `SELECT r.*, it.title AS item_title,
            ru.nickname AS reviewer_nickname, re.nickname AS reviewee_nickname
     FROM reviews r
     JOIN orders o ON r.order_id = o.id
     JOIN items it ON o.item_id = it.id
     JOIN users ru ON r.reviewer_id = ru.id
     JOIN users re ON r.reviewee_id = re.id${whereSql}
     ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`
  ).all(userId, pageSize, (page - 1) * pageSize);

  const stat = db.prepare(
    'SELECT COUNT(*) AS count, ROUND(AVG(rating), 2) AS avg FROM reviews WHERE reviewee_id = ?'
  ).get(userId);

  res.json({
    reviews, total, page, pageSize, pages: Math.ceil(total / pageSize) || 1,
    summary: { count: stat.count, avg: stat.avg || 0 },
  });
});

// 我给出 / 我收到的评价
router.get('/mine', auth, (req, res) => {
  const role = req.query.role === 'received' ? 'received' : 'given';
  const col = role === 'given' ? 'r.reviewer_id' : 'r.reviewee_id';
  const reviews = db.prepare(
    `SELECT r.*, it.title AS item_title,
            ru.nickname AS reviewer_nickname, re.nickname AS reviewee_nickname
     FROM reviews r
     JOIN orders o ON r.order_id = o.id
     JOIN items it ON o.item_id = it.id
     JOIN users ru ON r.reviewer_id = ru.id
     JOIN users re ON r.reviewee_id = re.id
     WHERE ${col} = ?
     ORDER BY r.created_at DESC, r.id DESC`
  ).all(req.userId);
  const stat = db.prepare(
    'SELECT COUNT(*) AS count, ROUND(AVG(rating), 2) AS avg FROM reviews WHERE reviewee_id = ?'
  ).get(req.userId);
  const givenCount = db.prepare('SELECT COUNT(*) AS c FROM reviews WHERE reviewer_id = ?').get(req.userId).c;
  res.json({
    reviews, role,
    summary: { received: stat.count, avg: stat.avg || 0, given: givenCount },
  });
});

// 待评价订单（已完成且我还没评过）
router.get('/pending', auth, (req, res) => {
  const orders = db.prepare(
    `SELECT o.*, it.title AS item_title,
            CASE WHEN o.buyer_id = ? THEN se.nickname ELSE bu.nickname END AS reviewee_nickname,
            CASE WHEN o.buyer_id = ? THEN 'buyer' ELSE 'seller' END AS my_role
     FROM orders o
     JOIN items it ON o.item_id = it.id
     JOIN users bu ON o.buyer_id = bu.id
     JOIN users se ON o.seller_id = se.id
     WHERE o.status = '已完成'
       AND (o.buyer_id = ? OR o.seller_id = ?)
       AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.order_id = o.id AND r.reviewer_id = ?)
     ORDER BY o.updated_at DESC`
  ).all(req.userId, req.userId, req.userId, req.userId, req.userId);
  res.json({ orders });
});

// 提交评价：仅交易完成后、仅订单参与方、每单每人一次
router.post('/', auth, (req, res) => {
  const { order_id, rating, content = '' } = req.body || {};
  const ratingN = Number(rating);
  if (!Number.isInteger(ratingN) || ratingN < 1 || ratingN > 5) {
    return res.status(400).json({ message: '评分必须是 1-5 的整数' });
  }
  if (String(content).length > 500) return res.status(400).json({ message: '评价内容过长（不超过 500 字）' });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id);
  if (!order) return res.status(404).json({ message: '订单不存在' });

  const relation = order.buyer_id === req.userId ? 'buyer' : order.seller_id === req.userId ? 'seller' : null;
  if (!relation) return res.status(403).json({ message: '只有交易双方可以评价' });
  if (order.status !== '已完成') return res.status(400).json({ message: '交易完成后才能评价' });

  const dup = db.prepare('SELECT id FROM reviews WHERE order_id = ? AND reviewer_id = ?').get(order.id, req.userId);
  if (dup) return res.status(409).json({ message: '你已评价过该订单' });

  const revieweeId = relation === 'buyer' ? order.seller_id : order.buyer_id;
  const item = db.prepare('SELECT title FROM items WHERE id = ?').get(order.item_id);

  const info = db.prepare(
    'INSERT INTO reviews (order_id, reviewer_id, reviewee_id, rating, content, role) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(order.id, req.userId, revieweeId, ratingN, String(content || ''), relation);

  const credit = recalcCredit(revieweeId);

  notify(revieweeId, {
    type: 'review',
    title: '你收到一条新评价',
    body: `${relation === 'buyer' ? '买家' : '卖家'}给了你 ${ratingN} 星评价${item ? `（${item.title}）` : ''}。`,
    link: '/reviews',
  });

  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(info.lastInsertRowid);
  res.json({ message: '评价已提交', review, credit_score: credit });
});

// 删除自己的评价（提交后 24 小时内）
router.delete('/:id', auth, (req, res) => {
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  if (!review) return res.status(404).json({ message: '评价不存在' });
  if (review.reviewer_id !== req.userId && req.role !== 'admin') {
    return res.status(403).json({ message: '只能删除自己的评价' });
  }
  db.prepare('DELETE FROM reviews WHERE id = ?').run(review.id);
  const credit = recalcCredit(review.reviewee_id);
  res.json({ message: '评价已删除', credit_score: credit });
});

module.exports = router;
