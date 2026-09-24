const express = require('express');
const { db, dayOffset } = require('../db');
const { auth } = require('../middleware/auth');
const { fail, num, clamp, paging } = require('./util');

const router = express.Router();
router.use(auth);

// 错题状态机：new → reviewing → mastered（可重做）
const WRONG_STATUSES = ['new', 'reviewing', 'mastered'];
const WRONG_TRANSITIONS = {
  new: ['reviewing', 'mastered'],
  reviewing: ['mastered', 'new'],
  mastered: ['reviewing'],
};

// ---------- 统计概览（先于 /:id 注册）----------
router.get('/summary', (req, res) => {
  const uid = req.user.uid;
  const rows = db.prepare('SELECT subject, status FROM wrong_questions WHERE user_id=?').all(uid);
  const byStatus = { new: 0, reviewing: 0, mastered: 0 };
  const bySubject = {};
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    bySubject[r.subject] = bySubject[r.subject] || { subject: r.subject, total: 0, mastered: 0, new: 0 };
    bySubject[r.subject].total += 1;
    if (r.status === 'mastered') bySubject[r.subject].mastered += 1;
    if (r.status === 'new') bySubject[r.subject].new += 1;
  }
  const subjects = Object.values(bySubject)
    .map((s) => ({ ...s, mastery_rate: s.total ? Math.round(s.mastered / s.total * 100) : 0 }))
    .sort((a, b) => a.mastery_rate - b.mastery_rate);
  res.json({
    ok: true,
    total: rows.length,
    by_status: byStatus,
    subjects,
    mastery_rate: rows.length ? Math.round(byStatus.mastered / rows.length * 100) : 0,
  });
});

// ---------- 列表（分页 + 搜索 + 科目/状态筛选）----------
router.get('/', (req, res) => {
  let where = 'user_id = ?';
  const params = [req.user.uid];
  if (req.query.subject) { where += ' AND subject = ?'; params.push(req.query.subject); }
  if (WRONG_STATUSES.includes(req.query.status)) { where += ' AND status = ?'; params.push(req.query.status); }
  if (req.query.knowledge_point) { where += ' AND knowledge_point LIKE ?'; params.push(`%${req.query.knowledge_point}%`); }
  if (req.query.q) {
    where += ' AND (question LIKE ? OR knowledge_point LIKE ? OR wrong_reason LIKE ?)';
    params.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`);
  }

  const usePage = req.query.page != null || req.query.pageSize != null;
  if (usePage) {
    const { page, pageSize, offset } = paging(req, 20, 100);
    const total = db.prepare(`SELECT COUNT(*) AS c FROM wrong_questions WHERE ${where}`).get(...params).c;
    const rows = db.prepare(
      `SELECT * FROM wrong_questions WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, offset);
    return res.json({ ok: true, wrong_questions: rows, total, page, pageSize });
  }
  const rows = db.prepare(
    `SELECT * FROM wrong_questions WHERE ${where} ORDER BY created_at DESC, id DESC`
  ).all(...params);
  res.json({ ok: true, wrong_questions: rows });
});

// ---------- 详情 ----------
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM wrong_questions WHERE id=? AND user_id=?').get(num(req.params.id), req.user.uid);
  if (!row) return fail(res, '错题不存在', 404);
  res.json({ ok: true, wrong_question: row });
});

// ---------- 录入错题 ----------
router.post('/', (req, res) => {
  const { subject, knowledge_point, question, my_answer, right_answer, wrong_reason } = req.body || {};
  if (!subject || !String(subject).trim()) return fail(res, '科目不能为空');
  if (!question || !String(question).trim()) return fail(res, '题目内容不能为空');
  const info = db.prepare(`
    INSERT INTO wrong_questions (user_id,subject,knowledge_point,question,my_answer,right_answer,wrong_reason,status)
    VALUES (?,?,?,?,?,?,?,'new')
  `).run(
    req.user.uid, String(subject).trim(), String(knowledge_point || '').trim(),
    String(question).trim(), String(my_answer || '').trim(),
    String(right_answer || '').trim(), String(wrong_reason || '').trim()
  );
  res.status(201).json({ ok: true, wrong_question: db.prepare('SELECT * FROM wrong_questions WHERE id=?').get(info.lastInsertRowid) });
});

// ---------- 重做：状态流转 + 复做次数 ----------
router.put('/:id/review', (req, res) => {
  const id = num(req.params.id);
  const row = db.prepare('SELECT * FROM wrong_questions WHERE id=? AND user_id=?').get(id, req.user.uid);
  if (!row) return fail(res, '错题不存在', 404);

  const to = String((req.body || {}).status || '');
  // 重做默认进入 reviewing；也可直接标 mastered
  const target = to || 'reviewing';
  if (!WRONG_STATUSES.includes(target)) {
    return fail(res, `状态非法，可选：${WRONG_STATUSES.join(' / ')}`);
  }
  if (!(WRONG_TRANSITIONS[row.status] || []).includes(target)) {
    return fail(res, `非法状态流转：${row.status} → ${target}`);
  }
  db.prepare(`
    UPDATE wrong_questions SET status=?, review_count=review_count+1, last_review_at=datetime('now','localtime')
    WHERE id=?
  `).run(target, id);
  res.json({ ok: true, wrong_question: db.prepare('SELECT * FROM wrong_questions WHERE id=?').get(id) });
});

// ---------- 标记掌握 / 取消掌握 ----------
router.put('/:id/master', (req, res) => {
  const id = num(req.params.id);
  const row = db.prepare('SELECT * FROM wrong_questions WHERE id=? AND user_id=?').get(id, req.user.uid);
  if (!row) return fail(res, '错题不存在', 404);
  const mastered = (req.body || {}).mastered !== false;
  const target = mastered ? 'mastered' : 'reviewing';
  if (row.status === target) return fail(res, `错题已处于 ${target} 状态`);
  if (!(WRONG_TRANSITIONS[row.status] || []).includes(target)) {
    return fail(res, `非法状态流转：${row.status} → ${target}`);
  }
  db.prepare(`
    UPDATE wrong_questions SET status=?, last_review_at=datetime('now','localtime') WHERE id=?
  `).run(target, id);
  res.json({ ok: true, wrong_question: db.prepare('SELECT * FROM wrong_questions WHERE id=?').get(id) });
});

// ---------- 编辑 ----------
router.put('/:id', (req, res) => {
  const id = num(req.params.id);
  const row = db.prepare('SELECT * FROM wrong_questions WHERE id=? AND user_id=?').get(id, req.user.uid);
  if (!row) return fail(res, '错题不存在', 404);
  const subject = req.body.subject != null ? String(req.body.subject).trim() : row.subject;
  const question = req.body.question != null ? String(req.body.question).trim() : row.question;
  if (!subject || !question) return fail(res, '科目与题目不能为空');
  const knowledge_point = req.body.knowledge_point != null ? String(req.body.knowledge_point).trim() : row.knowledge_point;
  const my_answer = req.body.my_answer != null ? String(req.body.my_answer).trim() : row.my_answer;
  const right_answer = req.body.right_answer != null ? String(req.body.right_answer).trim() : row.right_answer;
  const wrong_reason = req.body.wrong_reason != null ? String(req.body.wrong_reason).trim() : row.wrong_reason;

  db.prepare(`
    UPDATE wrong_questions SET subject=?, knowledge_point=?, question=?, my_answer=?, right_answer=?, wrong_reason=?
    WHERE id=?
  `).run(subject, knowledge_point, question, my_answer, right_answer, wrong_reason, id);
  res.json({ ok: true, wrong_question: db.prepare('SELECT * FROM wrong_questions WHERE id=?').get(id) });
});

// ---------- 删除 ----------
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM wrong_questions WHERE id=? AND user_id=?').run(num(req.params.id), req.user.uid);
  if (!info.changes) return fail(res, '错题不存在', 404);
  res.json({ ok: true });
});

module.exports = router;
void dayOffset;
