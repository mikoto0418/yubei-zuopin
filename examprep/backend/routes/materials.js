const express = require('express');
const { db } = require('../db');
const { auth } = require('../middleware/auth');
const { fail, num, clamp, paging } = require('./util');

const router = express.Router();
router.use(auth);

const TYPES = ['book', 'link', 'note', 'video'];
const STATUSES = ['reading', 'finished', 'paused'];

// ---------- 概览（先于 /:id 注册）----------
router.get('/summary', (req, res) => {
  const uid = req.user.uid;
  const rows = db.prepare('SELECT subject, type, status, total_pages, read_pages FROM study_materials WHERE user_id=?').all(uid);
  const bySubject = {};
  for (const r of rows) {
    bySubject[r.subject] = bySubject[r.subject] || { subject: r.subject, total: 0, finished: 0, pages: 0, read: 0 };
    bySubject[r.subject].total += 1;
    if (r.status === 'finished') bySubject[r.subject].finished += 1;
    bySubject[r.subject].pages += r.total_pages || 0;
    bySubject[r.subject].read += r.read_pages || 0;
  }
  const subjects = Object.values(bySubject).map((s) => ({
    ...s,
    progress: s.pages ? Math.round(s.read / s.pages * 100) : 0,
  })).sort((a, b) => a.progress - b.progress);
  const pages = rows.reduce((s, r) => s + (r.total_pages || 0), 0);
  const read = rows.reduce((s, r) => s + (r.read_pages || 0), 0);
  const byType = {};
  for (const r of rows) byType[r.type] = (byType[r.type] || 0) + 1;
  res.json({
    ok: true,
    total: rows.length,
    finished: rows.filter((r) => r.status === 'finished').length,
    pages, read_pages: read,
    progress: pages ? Math.round(read / pages * 100) : 0,
    by_type: byType,
    subjects,
  });
});

// ---------- 列表（分页 + 搜索 + 筛选）----------
router.get('/', (req, res) => {
  let where = 'user_id = ?';
  const params = [req.user.uid];
  if (req.query.subject) { where += ' AND subject = ?'; params.push(req.query.subject); }
  if (TYPES.includes(req.query.type)) { where += ' AND type = ?'; params.push(req.query.type); }
  if (STATUSES.includes(req.query.status)) { where += ' AND status = ?'; params.push(req.query.status); }
  if (req.query.q) { where += ' AND (title LIKE ? OR note LIKE ?)'; params.push(`%${req.query.q}%`, `%${req.query.q}%`); }

  const usePage = req.query.page != null || req.query.pageSize != null;
  if (usePage) {
    const { page, pageSize, offset } = paging(req, 20, 100);
    const total = db.prepare(`SELECT COUNT(*) AS c FROM study_materials WHERE ${where}`).get(...params).c;
    const rows = db.prepare(
      `SELECT * FROM study_materials WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, offset);
    return res.json({ ok: true, materials: rows, total, page, pageSize });
  }
  const rows = db.prepare(
    `SELECT * FROM study_materials WHERE ${where} ORDER BY created_at DESC, id DESC`
  ).all(...params);
  res.json({ ok: true, materials: rows });
});

// ---------- 详情 ----------
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM study_materials WHERE id=? AND user_id=?').get(num(req.params.id), req.user.uid);
  if (!row) return fail(res, '资料不存在', 404);
  res.json({ ok: true, material: row });
});

// ---------- 新建资料 ----------
router.post('/', (req, res) => {
  const { subject, title, type, url, total_pages, read_pages, note } = req.body || {};
  if (!subject || !String(subject).trim()) return fail(res, '科目不能为空');
  if (!title || !String(title).trim()) return fail(res, '资料标题不能为空');
  const t = TYPES.includes(type) ? type : 'link';
  if (t === 'link' && url && !/^https?:\/\//i.test(String(url))) {
    return fail(res, '链接需以 http:// 或 https:// 开头');
  }
  const pages = Math.max(0, Math.floor(num(total_pages, 0)));
  const read = clamp(Math.floor(num(read_pages, 0)), 0, pages || 9999);
  const info = db.prepare(`
    INSERT INTO study_materials (user_id,subject,title,type,url,total_pages,read_pages,status,note)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(
    req.user.uid, String(subject).trim(), String(title).trim(), t,
    String(url || '').trim(), pages, read,
    read > 0 && pages > 0 && read >= pages ? 'finished' : 'reading',
    String(note || '').trim()
  );
  res.status(201).json({ ok: true, material: db.prepare('SELECT * FROM study_materials WHERE id=?').get(info.lastInsertRowid) });
});

// ---------- 更新阅读进度 ----------
router.put('/:id/progress', (req, res) => {
  const id = num(req.params.id);
  const row = db.prepare('SELECT * FROM study_materials WHERE id=? AND user_id=?').get(id, req.user.uid);
  if (!row) return fail(res, '资料不存在', 404);
  const read = Math.floor(num((req.body || {}).read_pages, NaN));
  if (!Number.isFinite(read) || read < 0) return fail(res, '阅读页数需为非负整数');
  const pages = row.total_pages || 0;
  if (pages > 0 && read > pages) return fail(res, `阅读页数不能超过总页数（${pages}）`);
  const status = pages > 0 && read >= pages ? 'finished' : 'reading';
  db.prepare('UPDATE study_materials SET read_pages=?, status=? WHERE id=?').run(read, status, id);
  res.json({ ok: true, material: db.prepare('SELECT * FROM study_materials WHERE id=?').get(id) });
});

// ---------- 编辑 ----------
router.put('/:id', (req, res) => {
  const id = num(req.params.id);
  const row = db.prepare('SELECT * FROM study_materials WHERE id=? AND user_id=?').get(id, req.user.uid);
  if (!row) return fail(res, '资料不存在', 404);
  const subject = req.body.subject != null ? String(req.body.subject).trim() : row.subject;
  const title = req.body.title != null ? String(req.body.title).trim() : row.title;
  if (!subject || !title) return fail(res, '科目与标题不能为空');
  const type = TYPES.includes(req.body.type) ? req.body.type : row.type;
  const url = req.body.url != null ? String(req.body.url).trim() : row.url;
  const pages = req.body.total_pages != null ? Math.max(0, Math.floor(num(req.body.total_pages))) : row.total_pages;
  const read = req.body.read_pages != null ? clamp(Math.floor(num(req.body.read_pages)), 0, pages || 9999) : row.read_pages;
  const status = STATUSES.includes(req.body.status) ? req.body.status
    : (pages > 0 && read >= pages ? 'finished' : row.status);
  const note = req.body.note != null ? String(req.body.note).trim() : row.note;

  db.prepare(`
    UPDATE study_materials SET subject=?, title=?, type=?, url=?, total_pages=?, read_pages=?, status=?, note=?
    WHERE id=?
  `).run(subject, title, type, url, pages, read, status, note, id);
  res.json({ ok: true, material: db.prepare('SELECT * FROM study_materials WHERE id=?').get(id) });
});

// ---------- 删除 ----------
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM study_materials WHERE id=? AND user_id=?').run(num(req.params.id), req.user.uid);
  if (!info.changes) return fail(res, '资料不存在', 404);
  res.json({ ok: true });
});

module.exports = router;
