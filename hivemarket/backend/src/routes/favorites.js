const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// 收藏/取消收藏
router.post('/toggle', auth, (req, res) => {
  const { item_id } = req.body || {};
  const item = db.prepare('SELECT id FROM items WHERE id = ?').get(item_id);
  if (!item) return res.status(404).json({ message: '商品不存在' });
  const existing = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND item_id = ?').get(req.userId, item_id);
  if (existing) {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND item_id = ?').run(req.userId, item_id);
    return res.json({ message: '已取消收藏', favorited: false });
  }
  db.prepare('INSERT INTO favorites (user_id, item_id) VALUES (?, ?)').run(req.userId, item_id);
  res.json({ message: '已收藏', favorited: true });
});

// 我的收藏列表
router.get('/mine', auth, (req, res) => {
  const items = db.prepare(
    `SELECT it.*, u.nickname AS seller_nickname, u.campus AS seller_campus, f.created_at AS fav_time
     FROM favorites f JOIN items it ON f.item_id = it.id
     JOIN users u ON it.seller_id = u.id
     WHERE f.user_id = ? ORDER BY f.created_at DESC`
  ).all(req.userId);
  res.json({ items });
});

// 判断某商品是否被当前用户收藏
router.get('/check', auth, (req, res) => {
  const { item_id } = req.query;
  const f = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND item_id = ?').get(req.userId, item_id);
  res.json({ favorited: !!f });
});

module.exports = router;