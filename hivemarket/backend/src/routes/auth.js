const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { auth, signToken } = require('../middleware/auth');

const router = express.Router();

// 注册
router.post('/register', (req, res) => {
  const { username, password, nickname, campus } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: '用户名和密码不能为空' });
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ message: '用户名需为 3-20 位字母/数字/下划线' });
  }
  if (password.length < 6) return res.status(400).json({ message: '密码至少 6 位' });

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ message: '用户名已被占用' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    'INSERT INTO users (username, password, nickname, campus) VALUES (?, ?, ?, ?)'
  ).run(username, hash, nickname || username, campus || '未填写');

  const user = db.prepare('SELECT id, username, role, nickname, campus FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.json({ message: '注册成功', token: signToken(user), user });
});

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: '请输入用户名和密码' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ message: '用户名或密码错误' });
  }
  res.json({
    message: '登录成功',
    token: signToken(user),
    user: { id: user.id, username: user.username, role: user.role, nickname: user.nickname, campus: user.campus },
  });
});

// 当前登录用户信息
router.get('/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, username, role, nickname, campus, avatar, created_at FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ message: '用户不存在' });
  res.json({ user });
});

// 更新个人资料（昵称/校区/头像URL）
router.put('/me', auth, (req, res) => {
  const { nickname, campus, avatar } = req.body || {};
  db.prepare('UPDATE users SET nickname = ?, campus = ?, avatar = ? WHERE id = ?').run(
    nickname ?? null, campus ?? null, avatar ?? '', req.userId
  );
  const user = db.prepare('SELECT id, username, role, nickname, campus, avatar, created_at FROM users WHERE id = ?').get(req.userId);
  res.json({ user });
});

module.exports = router;