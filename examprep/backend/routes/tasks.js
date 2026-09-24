const express = require('express');
const { db } = require('../db');
const { auth } = require('../middleware/auth');
const { fail, num, paging } = require('./util');

const router = express.Router();
router.use(auth);

// 做题记录列表（支持 ?q= 科目搜索 / ?subject= 筛选 / 分页）
router.get('/', (req, res) => {
  let where = 'user_id = ?';
  const params = [req.user.uid];
  const q = (req.query.q || '').trim();
  if (q || req.query.subject) {
    const kw = `%${q || req.query.subject}%`;
    where += ' AND (subject LIKE ? OR tags LIKE ?)';
    params.push(kw, kw);
  }

  const usePage = req.query.page != null || req.query.pageSize != null;
  if (usePage) {
    const { page, pageSize, offset } = paging(req, 20, 100);
    const total = db.prepare(`SELECT COUNT(*) AS c FROM tasks WHERE ${where}`).get(...params).c;
    const rows = db.prepare(
      `SELECT * FROM tasks WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, offset);
    return res.json({ ok: true, tasks: rows, total, page, pageSize });
  }
  const rows = db.prepare(`SELECT * FROM tasks WHERE ${where} ORDER BY created_at DESC, id DESC`).all(...params);
  res.json({ ok: true, tasks: rows });
});

// 按科目 + 知识点统计正确率
router.get('/accuracy', (req, res) => {
  const rows = db.prepare('SELECT subject, tags, total, correct FROM tasks WHERE user_id=?').all(req.user.uid);
  const map = {};
  let overall = { total: 0, correct: 0 };
  for (const r of rows) {
    if (!map[r.subject]) map[r.subject] = { total: 0, correct: 0, tags: {} };
    map[r.subject].total += r.total || 0;
    map[r.subject].correct += r.correct || 0;
    overall.total += r.total || 0;
    overall.correct += r.correct || 0;
    (r.tags || '').split(/[,，;；]/).map(s => s.trim()).filter(Boolean).forEach(t => {
      if (!map[r.subject].tags[t]) map[r.subject].tags[t] = { total: 0, correct: 0 };
      map[r.subject].tags[t].total += r.total || 0;
      map[r.subject].tags[t].correct += r.correct || 0;
    });
  }
  const subjects = Object.keys(map).map(s => {
    const rate = map[s].total ? Math.round((map[s].correct / map[s].total) * 100) : 0;
    const tagList = Object.keys(map[s].tags).map(t => ({
      tag: t,
      accuracy: map[s].tags[t].total ? Math.round((map[s].tags[t].correct / map[s].tags[t].total) * 100) : 0,
      total: map[s].tags[t].total,
    })).sort((a, b) => a.accuracy - b.accuracy);
    return { subject: s, total: map[s].total, correct: map[s].correct, accuracy: rate, tags: tagList };
  });
  res.json({
    ok: true,
    accuracy: subjects,
    overall: overall.total ? { total: overall.total, correct: overall.correct, accuracy: Math.round(overall.correct / overall.total * 100) } : null,
  });
});

// 做题记录详情（置于 /accuracy 之后，避免被静态度遮蔽）
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM tasks WHERE id=? AND user_id=?').get(num(req.params.id), req.user.uid);
  if (!row) return fail(res, '做题记录不存在', 404);
  res.json({ ok: true, task: row });
});

// 新增做题记录
router.post('/', (req, res) => {
  const { subject, total, correct, tags } = req.body || {};
  const subj = subject && String(subject).trim();
  if (!subj) return fail(res, '科目不能为空');
  const t = Math.floor(num(total, 0));
  if (t <= 0) return fail(res, '做题数需大于 0');
  const c = Math.floor(num(correct, 0));
  if (c < 0) return fail(res, '做对数不能为负数');
  if (c > t) return fail(res, `做对数不能超过做题数（${t}）`);
  const info = db.prepare(
    'INSERT INTO tasks (user_id,subject,total,correct,tags) VALUES (?,?,?,?,?)'
  ).run(req.user.uid, subj, t, c, String(tags || '').trim());
  res.status(201).json({ ok: true, task: db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid) });
});

// 更新做题记录
router.put('/:id', (req, res) => {
  const id = num(req.params.id);
  const row = db.prepare('SELECT * FROM tasks WHERE id=? AND user_id=?').get(id, req.user.uid);
  if (!row) return fail(res, '做题记录不存在', 404);

  const subj = req.body.subject != null ? String(req.body.subject).trim() : row.subject;
  if (!subj) return fail(res, '科目不能为空');
  const t = req.body.total != null ? Math.floor(num(req.body.total)) : row.total;
  if (t <= 0) return fail(res, '做题数需大于 0');
  const c = req.body.correct != null ? Math.floor(num(req.body.correct)) : row.correct;
  if (c < 0 || c > t) return fail(res, c > t ? `做对数不能超过做题数（${t}）` : '做对数不能为负数');
  const tags = req.body.tags != null ? String(req.body.tags).trim() : row.tags;

  db.prepare('UPDATE tasks SET subject=?, total=?, correct=?, tags=? WHERE id=?')
    .run(subj, t, c, tags, id);
  res.json({ ok: true, task: db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) });
});

// 删除记录
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM tasks WHERE id=? AND user_id=?').run(num(req.params.id), req.user.uid);
  if (!info.changes) return fail(res, '记录不存在', 404);
  res.json({ ok: true });
});

module.exports = router;