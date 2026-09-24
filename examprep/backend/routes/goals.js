const express = require('express');
const { db } = require('../db');
const { auth } = require('../middleware/auth');
const { fail, num, clamp, paging } = require('./util');

const router = express.Router();
router.use(auth);

// 校验目标字段，返回错误信息或 null
function validateGoal(body, partial = true) {
  const { subject, target, weight, progress } = body || {};
  if (!partial && !subject) return '科目不能为空';
  if (subject != null && !String(subject).trim()) return '科目不能为空';
  if (target != null && num(target) <= 0) return '目标分需大于 0';
  if (weight != null && num(weight) < 0) return '权重不能为负数';
  if (progress != null && (num(progress) < 0 || num(progress) > 1000)) return '进度分需在 0-1000 之间';
  return null;
}

// 目标列表（支持搜索 q / 状态筛选 / 分页）
router.get('/', (req, res) => {
  let where = 'user_id = ?';
  const params = [req.user.uid];
  if (req.query.q) { where += ' AND subject LIKE ?'; params.push(`%${req.query.q}%`); }
  if (['active', 'archived'].includes(req.query.status)) { where += ' AND status = ?'; params.push(req.query.status); }

  const usePage = req.query.page != null || req.query.pageSize != null;
  if (usePage) {
    const { page, pageSize, offset } = paging(req, 20, 100);
    const total = db.prepare(`SELECT COUNT(*) AS c FROM goals WHERE ${where}`).get(...params).c;
    const rows = db.prepare(
      `SELECT * FROM goals WHERE ${where} ORDER BY weight DESC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, offset);
    return res.json({ ok: true, goals: rows, total, page, pageSize });
  }
  const rows = db.prepare(`SELECT * FROM goals WHERE ${where} ORDER BY weight DESC`).all(...params);
  res.json({ ok: true, goals: rows });
});

// 目标详情
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM goals WHERE id=? AND user_id=?').get(num(req.params.id), req.user.uid);
  if (!row) return fail(res, '目标不存在', 404);
  res.json({ ok: true, goal: row });
});

// 新建目标
router.post('/', (req, res) => {
  const msg = validateGoal(req.body, false);
  if (msg) return fail(res, msg);
  const { subject, target, weight, progress } = req.body;
  const info = db.prepare(
    'INSERT INTO goals (user_id,subject,target,weight,progress,status) VALUES (?,?,?,?,?,?)'
  ).run(req.user.uid, String(subject).trim(), num(target, 100), clamp(num(weight, 1), 0, 10), clamp(num(progress, 0), 0, 1000), 'active');
  const row = db.prepare('SELECT * FROM goals WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ok: true, goal: row });
});

// 更新目标（科目/目标分/权重/进度/状态）
router.put('/:id', (req, res) => {
  const id = num(req.params.id);
  const row = db.prepare('SELECT * FROM goals WHERE id=? AND user_id=?').get(id, req.user.uid);
  if (!row) return fail(res, '目标不存在', 404);
  const msg = validateGoal(req.body);
  if (msg) return fail(res, msg);

  const subject = req.body.subject != null ? String(req.body.subject).trim() : row.subject;
  const target = req.body.target != null ? num(req.body.target) : row.target;
  const weight = req.body.weight != null ? clamp(num(req.body.weight), 0, 10) : row.weight;
  const progress = req.body.progress != null ? clamp(num(req.body.progress), 0, 1000) : row.progress;
  const status = ['active', 'archived'].includes(req.body.status) ? req.body.status : row.status;
  db.prepare('UPDATE goals SET subject=?, target=?, weight=?, progress=?, status=? WHERE id=?')
    .run(subject, target, weight, progress, status, id);
  res.json({ ok: true, goal: db.prepare('SELECT * FROM goals WHERE id = ?').get(id) });
});

// 删除目标
router.delete('/:id', (req, res) => {
  const id = num(req.params.id);
  const info = db.prepare('DELETE FROM goals WHERE id=? AND user_id=?').run(id, req.user.uid);
  if (!info.changes) return fail(res, '目标不存在', 404);
  res.json({ ok: true });
});

module.exports = router;