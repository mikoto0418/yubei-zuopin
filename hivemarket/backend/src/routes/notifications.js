const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// 通知列表：?unread=1 只看未读；分页
router.get('/', auth, (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
  const onlyUnread = String(req.query.unread || '') === '1';

  const where = ['user_id = ?'];
  const params = [req.userId];
  if (onlyUnread) where.push('read = 0');
  const whereSql = ` WHERE ${where.join(' AND ')}`;

  const total = db.prepare(`SELECT COUNT(*) AS c FROM notifications${whereSql}`).get(...params).c;
  const unread = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0').get(req.userId).c;
  const notifications = db.prepare(
    `SELECT * FROM notifications${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, (page - 1) * pageSize);

  res.json({ notifications, total, unread, page, pageSize, pages: Math.ceil(total / pageSize) || 1 });
});

// 未读角标（顶部铃铛）
router.get('/unread-count', auth, (req, res) => {
  const unread = db.prepare(
    'SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0'
  ).get(req.userId).c;
  res.json({ unread });
});

// 全部已读（放在 /:id 之前，避免被参数路由吞掉）
router.patch('/read-all', auth, (req, res) => {
  const info = db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').run(req.userId);
  res.json({ message: '全部标记为已读', changed: info.changes, unread: 0 });
});

// 清理已读通知
router.delete('/read', auth, (req, res) => {
  const info = db.prepare('DELETE FROM notifications WHERE user_id = ? AND read = 1').run(req.userId);
  res.json({ message: '已清理已读通知', removed: info.changes });
});

// 单条已读
router.patch('/:id/read', auth, (req, res) => {
  const n = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
  if (!n) return res.status(404).json({ message: '通知不存在' });
  if (n.user_id !== req.userId) return res.status(403).json({ message: '无权操作该通知' });
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(n.id);
  const unread = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0').get(req.userId).c;
  res.json({ message: '已读', unread });
});

module.exports = router;
