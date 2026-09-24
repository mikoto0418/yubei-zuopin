const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// 求购列表
router.get('/', (req, res) => {
  const wants = db.prepare(
    `SELECT w.*, u.nickname AS buyer_nickname, u.campus AS buyer_campus
     FROM wants w JOIN users u ON w.buyer_id = u.id ORDER BY w.created_at DESC`
  ).all();
  res.json({ wants });
});

// 发布求购
router.post('/', auth, (req, res) => {
  const { title, description, budget } = req.body || {};
  if (!title) return res.status(400).json({ message: '求购内容不能为空' });
  const info = db.prepare(
    'INSERT INTO wants (title, description, budget, buyer_id, status) VALUES (?, ?, ?, ?, ?)'
  ).run(title, description || '', Number(budget) || 0, req.userId, '求购中');
  const want = db.prepare('SELECT * FROM wants WHERE id = ?').get(info.lastInsertRowid);
  res.json({ message: '发布成功', want });
});

// 关闭求购
router.delete('/:id', auth, (req, res) => {
  const want = db.prepare('SELECT * FROM wants WHERE id = ?').get(req.params.id);
  if (!want) return res.status(404).json({ message: '求购不存在' });
  if (want.buyer_id !== req.userId) return res.status(403).json({ message: '只能删除自己的求购' });
  db.prepare('DELETE FROM wants WHERE id = ?').run(want.id);
  res.json({ message: '已删除' });
});

module.exports = router;