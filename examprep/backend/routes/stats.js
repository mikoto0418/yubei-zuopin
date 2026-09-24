const express = require('express');
const { db } = require('../db');
const { auth } = require('../middleware/auth');
const { fail, num, clamp } = require('./util');

const router = express.Router();
router.use(auth);

const today = () => new Date().toISOString().slice(0, 10);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

// 最近 N 天学习时长列表（默认 7 天；?days= 可调，或 ?from=&to= 区间）
router.get('/:days?', (req, res) => {
  const uid = req.user.uid;
  let rows;
  if (req.query.from && isDate(req.query.from)) {
    rows = db.prepare(
      'SELECT * FROM stats WHERE user_id=? AND stat_date >= ? ORDER BY stat_date'
    ).all(uid, req.query.from);
  } else {
    const days = clamp(Math.floor(num(req.params.days || req.query.days, 7)), 1, 365);
    rows = db.prepare(
      'SELECT * FROM stats WHERE user_id=? AND stat_date >= date(\'now\', ?) ORDER BY stat_date'
    ).all(uid, `-${days} days`);
  }
  const total = rows.reduce((s, r) => s + (r.hours || 0), 0);
  res.json({ ok: true, stats: rows, total_hours: Math.round(total * 10) / 10 });
});

// 录入/累加当日学习时长
router.post('/', (req, res) => {
  const { hours, stat_date } = req.body || {};
  const h = num(hours, 0);
  if (h <= 0 || h > 24) return fail(res, '单次录入时长需在 0-24 小时之间');
  const date = stat_date && isDate(stat_date) ? stat_date : today();
  const row = db.prepare('SELECT * FROM stats WHERE user_id=? AND stat_date=?').get(req.user.uid, date);
  if (row) {
    db.prepare('UPDATE stats SET hours = hours + ? WHERE id=?').run(h, row.id);
  } else {
    db.prepare('INSERT INTO stats (user_id,stat_date,hours) VALUES (?,?,?)').run(req.user.uid, date, h);
  }
  res.json({ ok: true, stat: db.prepare('SELECT * FROM stats WHERE user_id=? AND stat_date=?').get(req.user.uid, date) });
});

// 更新指定日期学习时长（覆盖式）
router.put('/:date', (req, res) => {
  const date = req.params.date;
  if (!isDate(date)) return fail(res, '日期格式不正确');
  const h = num((req.body || {}).hours, 0);
  if (h < 0 || h > 24) return fail(res, '时长需在 0-24 小时之间');
  const row = db.prepare('SELECT * FROM stats WHERE user_id=? AND stat_date=?').get(req.user.uid, date);
  if (!row) return fail(res, '该日期无学习时长记录，请用录入接口', 404);
  db.prepare('UPDATE stats SET hours=? WHERE id=?').run(h, row.id);
  res.json({ ok: true, stat: db.prepare('SELECT * FROM stats WHERE user_id=? AND stat_date=?').get(req.user.uid, date) });
});

// 删除指定日期学习记录
router.delete('/:date', (req, res) => {
  const date = req.params.date;
  if (!isDate(date)) return fail(res, '日期格式不正确');
  const info = db.prepare('DELETE FROM stats WHERE user_id=? AND stat_date=?').run(req.user.uid, date);
  if (!info.changes) return fail(res, '该日期无学习时长记录', 404);
  res.json({ ok: true });
});

module.exports = router;