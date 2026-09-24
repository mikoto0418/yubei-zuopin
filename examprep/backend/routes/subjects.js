const express = require('express');
const { db } = require('../db');
const { auth } = require('../middleware/auth');
const { fail, num, clamp, paging } = require('./util');

const router = express.Router();
router.use(auth);

const COLORS = ['blue', 'green', 'red', 'orange', 'purple', 'pink', 'teal', 'yellow', 'indigo', 'gray'];

// ---------- 科目列表（含知识点数量与掌握度均分）----------
router.get('/', (req, res) => {
  let where = 's.user_id = ?';
  const params = [req.user.uid];
  if (req.query.q) { where += ' AND s.name LIKE ?'; params.push(`%${req.query.q}%`); }

  const usePage = req.query.page != null || req.query.pageSize != null;
  const sql = `
    SELECT s.*,
      (SELECT COUNT(*) FROM knowledge_points k WHERE k.subject_id = s.id) AS kp_count,
      (SELECT CAST(ROUND(AVG(k.mastery)) AS INTEGER) FROM knowledge_points k WHERE k.subject_id = s.id) AS avg_mastery
    FROM subjects s WHERE ${where} ORDER BY s.sort_no ASC, s.id ASC`;
  if (usePage) {
    const { page, pageSize, offset } = paging(req, 20, 100);
    const total = db.prepare(`SELECT COUNT(*) AS c FROM subjects s WHERE ${where}`).get(...params).c;
    const rows = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, pageSize, offset);
    return res.json({ ok: true, subjects: rows, total, page, pageSize });
  }
  res.json({ ok: true, subjects: db.prepare(sql).all(...params) });
});

// ---------- 知识点列表（?subject_id= / ?q= / 分页）----------
router.get('/knowledge-points', (req, res) => {
  let where = 'k.user_id = ?';
  const params = [req.user.uid];
  if (req.query.subject_id) { where += ' AND k.subject_id = ?'; params.push(num(req.query.subject_id)); }
  if (req.query.q) { where += ' AND (k.name LIKE ? OR k.chapter LIKE ?)'; params.push(`%${req.query.q}%`, `%${req.query.q}%`); }

  const usePage = req.query.page != null || req.query.pageSize != null;
  const sql = `
    SELECT k.*, s.name AS subject_name FROM knowledge_points k
    LEFT JOIN subjects s ON s.id = k.subject_id
    WHERE ${where} ORDER BY k.mastery ASC, k.id ASC`;
  if (usePage) {
    const { page, pageSize, offset } = paging(req, 20, 100);
    const total = db.prepare(`SELECT COUNT(*) AS c FROM knowledge_points k WHERE ${where}`).get(...params).c;
    const rows = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, pageSize, offset);
    return res.json({ ok: true, knowledge_points: rows, total, page, pageSize });
  }
  res.json({ ok: true, knowledge_points: db.prepare(sql).all(...params) });
});

// ---------- 新建科目 ----------
router.post('/', (req, res) => {
  const { name, color, exam_type, sort_no } = req.body || {};
  if (!name || !String(name).trim()) return fail(res, '科目名称不能为空');
  const exists = db.prepare('SELECT id FROM subjects WHERE user_id=? AND name=?').get(req.user.uid, String(name).trim());
  if (exists) return fail(res, '该科目已存在', 409);
  const info = db.prepare(
    'INSERT INTO subjects (user_id,name,color,exam_type,sort_no) VALUES (?,?,?,?,?)'
  ).run(
    req.user.uid, String(name).trim(),
    COLORS.includes(color) ? color : 'blue',
    String(exam_type || '考研').trim(),
    Math.floor(num(sort_no, 99))
  );
  res.status(201).json({ ok: true, subject: db.prepare('SELECT * FROM subjects WHERE id=?').get(info.lastInsertRowid) });
});

// ---------- 新建知识点 ----------
router.post('/knowledge-points', (req, res) => {
  const { subject_id, name, chapter, difficulty, mastery } = req.body || {};
  if (!name || !String(name).trim()) return fail(res, '知识点名称不能为空');
  const sid = num(subject_id);
  const subj = db.prepare('SELECT * FROM subjects WHERE id=? AND user_id=?').get(sid, req.user.uid);
  if (!subj) return fail(res, '科目不存在', 404);
  const info = db.prepare(
    'INSERT INTO knowledge_points (subject_id,user_id,name,chapter,difficulty,mastery) VALUES (?,?,?,?,?,?)'
  ).run(sid, req.user.uid, String(name).trim(), String(chapter || '').trim(),
    clamp(Math.floor(num(difficulty, 3)), 1, 5), clamp(Math.floor(num(mastery, 0)), 0, 100));
  res.status(201).json({ ok: true, knowledge_point: db.prepare('SELECT * FROM knowledge_points WHERE id=?').get(info.lastInsertRowid) });
});

// ---------- 更新知识点掌握度 ----------
router.put('/knowledge-points/:id', (req, res) => {
  const id = num(req.params.id);
  const row = db.prepare('SELECT * FROM knowledge_points WHERE id=? AND user_id=?').get(id, req.user.uid);
  if (!row) return fail(res, '知识点不存在', 404);
  const name = req.body.name != null ? String(req.body.name).trim() : row.name;
  if (!name) return fail(res, '知识点名称不能为空');
  const chapter = req.body.chapter != null ? String(req.body.chapter).trim() : row.chapter;
  const difficulty = req.body.difficulty != null ? clamp(Math.floor(num(req.body.difficulty)), 1, 5) : row.difficulty;
  const mastery = req.body.mastery != null ? clamp(Math.floor(num(req.body.mastery)), 0, 100) : row.mastery;
  db.prepare('UPDATE knowledge_points SET name=?, chapter=?, difficulty=?, mastery=? WHERE id=?')
    .run(name, chapter, difficulty, mastery, id);
  res.json({ ok: true, knowledge_point: db.prepare('SELECT * FROM knowledge_points WHERE id=?').get(id) });
});

// ---------- 更新科目 ----------
router.put('/:id', (req, res) => {
  const id = num(req.params.id);
  const row = db.prepare('SELECT * FROM subjects WHERE id=? AND user_id=?').get(id, req.user.uid);
  if (!row) return fail(res, '科目不存在', 404);
  const name = req.body.name != null ? String(req.body.name).trim() : row.name;
  if (!name) return fail(res, '科目名称不能为空');
  const color = COLORS.includes(req.body.color) ? req.body.color : row.color;
  const exam_type = req.body.exam_type != null ? String(req.body.exam_type).trim() : row.exam_type;
  const sort_no = req.body.sort_no != null ? Math.floor(num(req.body.sort_no)) : row.sort_no;
  db.prepare('UPDATE subjects SET name=?, color=?, exam_type=?, sort_no=? WHERE id=?')
    .run(name, color, exam_type, sort_no, id);
  res.json({ ok: true, subject: db.prepare('SELECT * FROM subjects WHERE id=?').get(id) });
});

// ---------- 删除科目（连带知识点）----------
router.delete('/:id', (req, res) => {
  const id = num(req.params.id);
  const row = db.prepare('SELECT * FROM subjects WHERE id=? AND user_id=?').get(id, req.user.uid);
  if (!row) return fail(res, '科目不存在', 404);
  db.prepare('DELETE FROM knowledge_points WHERE subject_id=? AND user_id=?').run(id, req.user.uid);
  db.prepare('DELETE FROM subjects WHERE id=?').run(id);
  res.json({ ok: true });
});

module.exports = router;
