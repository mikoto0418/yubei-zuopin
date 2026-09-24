const express = require('express');
const { db } = require('../db');
const { auth } = require('../middleware/auth');
const { fail, num, paging } = require('./util');

const router = express.Router();
router.use(auth);

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

// 解析各科得分 JSON（容错）
function parseScores(raw) {
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// ---------- 模考趋势（先于 /:id 注册，避免被参数路由吞掉）----------
router.get('/trend', (req, res) => {
  const uid = req.user.uid;
  const rows = db.prepare(
    'SELECT * FROM mock_exams WHERE user_id=? ORDER BY exam_date ASC, id ASC'
  ).all(uid);
  const trend = rows.map((r) => ({
    id: r.id, exam_name: r.exam_name, exam_date: r.exam_date,
    total_score: r.total_score, full_score: r.full_score,
    rate: r.full_score ? Math.round(r.total_score / r.full_score * 100) : 0,
    rank_no: r.rank_no,
  }));
  // 各科平均得分率
  const bySubject = {};
  for (const r of rows) {
    for (const s of parseScores(r.subject_scores)) {
      const k = s.subject;
      bySubject[k] = bySubject[k] || { subject: k, score: 0, full: 0, times: 0 };
      bySubject[k].score += num(s.score);
      bySubject[k].full += num(s.full, 100);
      bySubject[k].times += 1;
    }
  }
  const subjects = Object.values(bySubject).map((s) => ({
    subject: s.subject,
    avg_score: s.times ? Math.round(s.score / s.times * 10) / 10 : 0,
    full: s.times ? Math.round(s.full / s.times) : 0,
    rate: s.full ? Math.round(s.score / s.full * 100) : 0,
    times: s.times,
  })).sort((a, b) => a.rate - b.rate);

  const first = trend[0], last = trend[trend.length - 1];
  const delta = first && last ? last.total_score - first.total_score : 0;
  const best = trend.reduce((m, t) => (t.total_score > (m ? m.total_score : -1) ? t : m), null);
  res.json({
    ok: true,
    count: trend.length,
    trend,
    subjects,
    delta,
    best: best ? { exam_name: best.exam_name, total_score: best.total_score, exam_date: best.exam_date } : null,
    avg_rate: trend.length ? Math.round(trend.reduce((s, t) => s + t.rate, 0) / trend.length) : 0,
  });
});

// ---------- 列表（分页 + 搜索 + 日期筛选）----------
router.get('/', (req, res) => {
  let where = 'user_id = ?';
  const params = [req.user.uid];
  if (req.query.q) { where += ' AND exam_name LIKE ?'; params.push(`%${req.query.q}%`); }
  if (req.query.from && isDate(req.query.from)) { where += ' AND exam_date >= ?'; params.push(req.query.from); }

  const usePage = req.query.page != null || req.query.pageSize != null;
  if (usePage) {
    const { page, pageSize, offset } = paging(req, 20, 100);
    const total = db.prepare(`SELECT COUNT(*) AS c FROM mock_exams WHERE ${where}`).get(...params).c;
    const rows = db.prepare(
      `SELECT * FROM mock_exams WHERE ${where} ORDER BY exam_date DESC, id DESC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, offset);
    return res.json({ ok: true, exams: rows.map((r) => ({ ...r, subject_scores: parseScores(r.subject_scores) })), total, page, pageSize });
  }
  const rows = db.prepare(
    `SELECT * FROM mock_exams WHERE ${where} ORDER BY exam_date DESC, id DESC`
  ).all(...params);
  res.json({ ok: true, exams: rows.map((r) => ({ ...r, subject_scores: parseScores(r.subject_scores) })) });
});

// ---------- 详情 ----------
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM mock_exams WHERE id=? AND user_id=?').get(num(req.params.id), req.user.uid);
  if (!row) return fail(res, '模考记录不存在', 404);
  res.json({ ok: true, exam: { ...row, subject_scores: parseScores(row.subject_scores) } });
});

// ---------- 录入模考 ----------
router.post('/', (req, res) => {
  const { exam_name, exam_date, total_score, full_score, subject_scores, rank_no, note } = req.body || {};
  if (!exam_name || !String(exam_name).trim()) return fail(res, '模考名称不能为空');
  if (!isDate(exam_date)) return fail(res, '考试日期格式应为 YYYY-MM-DD');
  const full = num(full_score, 500);
  if (full <= 0) return fail(res, '满分需大于 0');
  const total = num(total_score, 0);
  if (total < 0) return fail(res, '总分不能为负数');
  if (total > full) return fail(res, `总分不能超过满分（${full}）`);
  const scores = parseScores(subject_scores);
  for (const s of scores) {
    if (num(s.score) < 0) return fail(res, `科目「${s.subject || '-'}」得分不能为负数`);
    if (num(s.full) > 0 && num(s.score) > num(s.full)) return fail(res, `科目「${s.subject || '-'}」得分不能超过满分`);
  }
  const info = db.prepare(`
    INSERT INTO mock_exams (user_id,exam_name,exam_date,total_score,full_score,subject_scores,rank_no,note)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(
    req.user.uid, String(exam_name).trim(), exam_date, total, full,
    JSON.stringify(scores),
    rank_no != null && num(rank_no) > 0 ? Math.floor(num(rank_no)) : null,
    String(note || '').trim()
  );
  const row = db.prepare('SELECT * FROM mock_exams WHERE id=?').get(info.lastInsertRowid);
  res.status(201).json({ ok: true, exam: { ...row, subject_scores: parseScores(row.subject_scores) } });
});

// ---------- 编辑 ----------
router.put('/:id', (req, res) => {
  const id = num(req.params.id);
  const row = db.prepare('SELECT * FROM mock_exams WHERE id=? AND user_id=?').get(id, req.user.uid);
  if (!row) return fail(res, '模考记录不存在', 404);
  const exam_name = req.body.exam_name != null ? String(req.body.exam_name).trim() : row.exam_name;
  if (!exam_name) return fail(res, '模考名称不能为空');
  const exam_date = isDate(req.body.exam_date) ? req.body.exam_date : row.exam_date;
  const full = req.body.full_score != null ? num(req.body.full_score) : row.full_score;
  if (full <= 0) return fail(res, '满分需大于 0');
  const total = req.body.total_score != null ? num(req.body.total_score) : row.total_score;
  if (total < 0 || total > full) return fail(res, `总分需在 0-${full} 之间`);
  const scores = req.body.subject_scores != null ? parseScores(req.body.subject_scores) : parseScores(row.subject_scores);
  const rank_no = req.body.rank_no != null ? (num(req.body.rank_no) > 0 ? Math.floor(num(req.body.rank_no)) : null) : row.rank_no;
  const note = req.body.note != null ? String(req.body.note).trim() : row.note;

  db.prepare(`
    UPDATE mock_exams SET exam_name=?, exam_date=?, total_score=?, full_score=?, subject_scores=?, rank_no=?, note=?
    WHERE id=?
  `).run(exam_name, exam_date, total, full, JSON.stringify(scores), rank_no, note, id);
  const out = db.prepare('SELECT * FROM mock_exams WHERE id=?').get(id);
  res.json({ ok: true, exam: { ...out, subject_scores: parseScores(out.subject_scores) } });
});

// ---------- 删除 ----------
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM mock_exams WHERE id=? AND user_id=?').run(num(req.params.id), req.user.uid);
  if (!info.changes) return fail(res, '模考记录不存在', 404);
  res.json({ ok: true });
});

module.exports = router;
