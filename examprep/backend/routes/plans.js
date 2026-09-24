const express = require('express');
const { db } = require('../db');
const { auth } = require('../middleware/auth');
const { fail, num, clamp, paging } = require('./util');

const router = express.Router();
router.use(auth);

const today = () => new Date().toISOString().slice(0, 10);

// 今日计划
router.get('/today', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM plans WHERE user_id=? AND plan_date=? ORDER BY done ASC, id ASC'
  ).all(req.user.uid, today());
  const doneCnt = rows.filter((p) => p.done).length;
  res.json({ ok: true, plan_date: today(), plans: rows, done: doneCnt, total: rows.length });
});

// 计划列表（支持 ?range= 天数 / ?q= 搜索 / ?done= 筛选 / 分页）
router.get('/', (req, res) => {
  const uid = req.user.uid;
  let where = 'user_id = ?';
  const params = [uid];
  if (req.query.range) {
    const days = clamp(Math.floor(num(req.query.range, 30)), 1, 365);
    where += ' AND plan_date >= date(\'now\', ?)';
    params.push(`-${days} days`);
  }
  if (req.query.q) { where += ' AND (subject LIKE ? OR content LIKE ?)'; params.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  if (req.query.done === '0' || req.query.done === '1') { where += ' AND done = ?'; params.push(Number(req.query.done)); }

  const usePage = req.query.page != null || req.query.pageSize != null;
  if (usePage) {
    const { page, pageSize, offset } = paging(req, 20, 100);
    const total = db.prepare(`SELECT COUNT(*) AS c FROM plans WHERE ${where}`).get(...params).c;
    const rows = db.prepare(
      `SELECT * FROM plans WHERE ${where} ORDER BY plan_date DESC, id DESC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, offset);
    return res.json({ ok: true, plans: rows, total, page, pageSize });
  }
  const rows = db.prepare(`SELECT * FROM plans WHERE ${where} ORDER BY plan_date DESC, id DESC`).all(...params);
  res.json({ ok: true, plans: rows });
});

// 计划详情
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM plans WHERE id=? AND user_id=?').get(num(req.params.id), req.user.uid);
  if (!row) return fail(res, '计划不存在', 404);
  res.json({ ok: true, plan: row });
});

// 新建计划
router.post('/', (req, res) => {
  const { plan_date, subject, content, exam_hours } = req.body || {};
  if (!subject || !String(subject).trim()) return fail(res, '科目不能为空');
  if (!content || !String(content).trim()) return fail(res, '计划内容不能为空');
  const hours = num(exam_hours, 0);
  if (hours < 0 || hours > 24) return fail(res, '预计时长需在 0-24 小时之间');
  const date = plan_date && /^\d{4}-\d{2}-\d{2}$/.test(plan_date) ? plan_date : today();
  const info = db.prepare(
    'INSERT INTO plans (user_id,plan_date,subject,content,exam_hours,done) VALUES (?,?,?,?,?,0)'
  ).run(req.user.uid, date, String(subject).trim(), String(content).trim(), hours);
  res.status(201).json({ ok: true, plan: db.prepare('SELECT * FROM plans WHERE id = ?').get(info.lastInsertRowid) });
});

// 更新计划（完成状态/内容/科目/时长/日期）
router.put('/:id', (req, res) => {
  const id = num(req.params.id);
  const row = db.prepare('SELECT * FROM plans WHERE id=? AND user_id=?').get(id, req.user.uid);
  if (!row) return fail(res, '计划不存在', 404);

  const subject = req.body.subject != null ? String(req.body.subject).trim() : row.subject;
  const content = req.body.content != null ? String(req.body.content).trim() : row.content;
  if (!subject || !content) return fail(res, '科目与内容不能为空');

  const hours = req.body.exam_hours != null ? num(req.body.exam_hours) : row.exam_hours;
  if (hours < 0 || hours > 24) return fail(res, '预计时长需在 0-24 小时之间');
  const done = req.body.done != null ? (req.body.done ? 1 : 0) : row.done;
  const date = req.body.plan_date && /^\d{4}-\d{2}-\d{2}$/.test(req.body.plan_date) ? req.body.plan_date : row.plan_date;

  db.prepare('UPDATE plans SET plan_date=?, done=?, content=?, exam_hours=?, subject=? WHERE id=?')
    .run(date, done, content, hours, subject, id);
  res.json({ ok: true, plan: db.prepare('SELECT * FROM plans WHERE id = ?').get(id) });
});

// 删除
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM plans WHERE id=? AND user_id=?').run(num(req.params.id), req.user.uid);
  if (!info.changes) return fail(res, '计划不存在', 404);
  res.json({ ok: true });
});

module.exports = router;