const express = require('express');
const { db, BLOCK_STATUSES, BLOCK_TRANSITIONS, dayOffset } = require('../db');
const { auth } = require('../middleware/auth');
const { fail, num, paging } = require('./util');

const router = express.Router();
router.use(auth);

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || '');

// "HH:MM" -> 分钟数
function toMin(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
}
const DURATIONS = [30, 60, 90, 120];

// 时间块状态机：planned → in_progress → done / skipped
function canTransit(from, to) {
  const allowed = BLOCK_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

// ---------- 日历视图：某天 / 某周的全部时间块 ----------
router.get('/calendar', (req, res) => {
  const uid = req.user.uid;
  const date = isDate(req.query.date) ? req.query.date : dayOffset(0);
  const days = Math.min(31, Math.max(1, Math.floor(num(req.query.days, 1))));
  const start = date;
  const endDate = (() => {
    const d = new Date(start + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days - 1);
    return d.toISOString().slice(0, 10);
  })();

  const rows = db.prepare(`
    SELECT b.*, k.name AS knowledge_name
    FROM plan_blocks b
    LEFT JOIN knowledge_points k ON k.id = b.knowledge_point_id
    WHERE b.user_id = ? AND b.block_date >= ? AND b.block_date <= ?
    ORDER BY b.block_date, b.start_time, b.id
  `).all(uid, start, endDate);

  const byDate = {};
  for (const r of rows) (byDate[r.block_date] = byDate[r.block_date] || []).push(r);
  const days_ = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    const ds = d.toISOString().slice(0, 10);
    days_.push({
      date: ds,
      blocks: byDate[ds] || [],
      minutes: (byDate[ds] || []).reduce((s, b) => s + (toMin(b.end_time) - toMin(b.start_time)), 0),
    });
  }
  res.json({ ok: true, start, end: endDate, days: days_ });
});

// ---------- 列表（分页 + 搜索 + 筛选）----------
router.get('/', (req, res) => {
  let where = 'b.user_id = ?';
  const params = [req.user.uid];
  if (req.query.date && isDate(req.query.date)) { where += ' AND b.block_date = ?'; params.push(req.query.date); }
  if (req.query.subject) { where += ' AND b.subject = ?'; params.push(req.query.subject); }
  if (BLOCK_STATUSES.includes(req.query.status)) { where += ' AND b.status = ?'; params.push(req.query.status); }
  if (req.query.q) {
    where += ' AND (b.title LIKE ? OR b.subject LIKE ?)';
    params.push(`%${req.query.q}%`, `%${req.query.q}%`);
  }

  const usePage = req.query.page != null || req.query.pageSize != null;
  if (usePage) {
    const { page, pageSize, offset } = paging(req, 20, 100);
    const total = db.prepare(`SELECT COUNT(*) AS c FROM plan_blocks b WHERE ${where}`).get(...params).c;
    const rows = db.prepare(
      `SELECT b.* FROM plan_blocks b WHERE ${where} ORDER BY b.block_date DESC, b.start_time DESC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, offset);
    return res.json({ ok: true, blocks: rows, total, page, pageSize });
  }
  const rows = db.prepare(
    `SELECT b.* FROM plan_blocks b WHERE ${where} ORDER BY b.block_date DESC, b.start_time DESC`
  ).all(...params);
  res.json({ ok: true, blocks: rows });
});

// ---------- 详情 ----------
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM plan_blocks WHERE id=? AND user_id=?').get(num(req.params.id), req.user.uid);
  if (!row) return fail(res, '时间块不存在', 404);
  res.json({ ok: true, block: row });
});

// ---------- 新建时间块（30 分钟粒度对齐校验）----------
router.post('/', (req, res) => {
  const { subject, title, block_date, start_time, end_time, plan_id, knowledge_point_id, source } = req.body || {};
  if (!subject || !String(subject).trim()) return fail(res, '科目不能为空');
  if (!title || !String(title).trim()) return fail(res, '时间块标题不能为空');
  if (!isDate(block_date)) return fail(res, '日期格式应为 YYYY-MM-DD');
  if (!isTime(start_time) || !isTime(end_time)) return fail(res, '时间格式应为 HH:MM');
  const sm = toMin(start_time), em = toMin(end_time);
  if (em <= sm) return fail(res, '结束时间需晚于开始时间');
  const dur = em - sm;
  if (!DURATIONS.includes(dur)) return fail(res, '时间块长度需为 30/60/90/120 分钟（30 分钟粒度）');
  if (sm % 30 !== 0) return fail(res, '开始时间需对齐到 30 分钟粒度（如 08:00 / 08:30）');

  // 同一天时间重叠校验
  const clash = db.prepare(`
    SELECT id, start_time, end_time FROM plan_blocks
    WHERE user_id=? AND block_date=? AND status != 'skipped'
  `).all(req.user.uid, block_date).find((b) => toMin(b.start_time) < em && toMin(b.end_time) > sm);
  if (clash) return fail(res, `与已有时间块冲突（${clash.start_time}-${clash.end_time}）`);

  const info = db.prepare(`
    INSERT INTO plan_blocks
    (user_id,plan_id,subject,title,block_date,start_time,end_time,status,source,knowledge_point_id)
    VALUES (?,?,?,?,?,?,?,'planned',?,?)
  `).run(
    req.user.uid,
    plan_id != null ? num(plan_id) : null,
    String(subject).trim(), String(title).trim(), block_date, start_time, end_time,
    ['manual', 'ai', 'import'].includes(source) ? source : 'manual',
    knowledge_point_id != null ? num(knowledge_point_id) : null
  );
  const row = db.prepare('SELECT * FROM plan_blocks WHERE id=?').get(info.lastInsertRowid);
  // 计划开始前提醒
  db.prepare(`
    INSERT INTO reminders (user_id,title,remind_at,related_type,related_id,status,channel)
    VALUES (?,?,?,?,?,'pending','app')
  `).run(req.user.uid, `${subject}·${title} 即将开始`, `${block_date} ${start_time}`, 'plan_block', row.id);
  res.status(201).json({ ok: true, block: row });
});

// ---------- 状态流转（状态机核心）----------
router.put('/:id/status', (req, res) => {
  const id = num(req.params.id);
  const row = db.prepare('SELECT * FROM plan_blocks WHERE id=? AND user_id=?').get(id, req.user.uid);
  if (!row) return fail(res, '时间块不存在', 404);

  const to = String((req.body || {}).status || '');
  if (!BLOCK_STATUSES.includes(to)) return fail(res, `状态非法，可选：${BLOCK_STATUSES.join(' / ')}`);
  if (to === row.status) return fail(res, `时间块已处于 ${to} 状态，无需重复流转`);
  if (!canTransit(row.status, to)) {
    return fail(res, `非法状态流转：${row.status} → ${to}（${row.status} 只能流转到 ${(BLOCK_TRANSITIONS[row.status] || []).join(' / ') || '无（终态）'}）`);
  }
  const reason = (req.body || {}).skip_reason;
  if (to === 'skipped' && (!reason || !String(reason).trim())) {
    return fail(res, '跳过时间块必须填写原因');
  }
  db.prepare(`
    UPDATE plan_blocks SET status=?, skip_reason=?, updated_at=datetime('now','localtime') WHERE id=?
  `).run(to, to === 'skipped' ? String(reason).trim() : null, id);

  // 完成时累加当日学习时长
  if (to === 'done') {
    const dur = (toMin(row.end_time) - toMin(row.start_time)) / 60;
    const stat = db.prepare('SELECT * FROM stats WHERE user_id=? AND stat_date=?').get(req.user.uid, row.block_date);
    if (stat) db.prepare('UPDATE stats SET hours = hours + ? WHERE id=?').run(dur, stat.id);
    else db.prepare('INSERT INTO stats (user_id,stat_date,hours) VALUES (?,?,?)').run(req.user.uid, row.block_date, dur);
  }
  res.json({ ok: true, block: db.prepare('SELECT * FROM plan_blocks WHERE id=?').get(id) });
});

// ---------- 拖拽改时段 / 改日期 ----------
router.put('/:id/schedule', (req, res) => {
  const id = num(req.params.id);
  const row = db.prepare('SELECT * FROM plan_blocks WHERE id=? AND user_id=?').get(id, req.user.uid);
  if (!row) return fail(res, '时间块不存在', 404);
  if (row.status === 'done' || row.status === 'skipped') {
    return fail(res, `${row.status} 的时间块不可再调整时段`);
  }
  const { block_date, start_time, end_time } = req.body || {};
  const date = isDate(block_date) ? block_date : row.block_date;
  const st = isTime(start_time) ? start_time : row.start_time;
  const et = isTime(end_time) ? end_time : row.end_time;
  const sm = toMin(st), em = toMin(et);
  if (em <= sm) return fail(res, '结束时间需晚于开始时间');
  const dur = em - sm;
  if (!DURATIONS.includes(dur)) return fail(res, '时间块长度需为 30/60/90/120 分钟');
  if (sm % 30 !== 0) return fail(res, '开始时间需对齐到 30 分钟粒度');

  const clash = db.prepare(`
    SELECT id, start_time, end_time FROM plan_blocks
    WHERE user_id=? AND block_date=? AND id != ? AND status != 'skipped'
  `).all(req.user.uid, date, id).find((b) => toMin(b.start_time) < em && toMin(b.end_time) > sm);
  if (clash) return fail(res, `与已有时间块冲突（${clash.start_time}-${clash.end_time}）`);

  db.prepare(`
    UPDATE plan_blocks SET block_date=?, start_time=?, end_time=?, updated_at=datetime('now','localtime') WHERE id=?
  `).run(date, st, et, id);
  res.json({ ok: true, block: db.prepare('SELECT * FROM plan_blocks WHERE id=?').get(id) });
});

// ---------- 编辑 ----------
router.put('/:id', (req, res) => {
  const id = num(req.params.id);
  const row = db.prepare('SELECT * FROM plan_blocks WHERE id=? AND user_id=?').get(id, req.user.uid);
  if (!row) return fail(res, '时间块不存在', 404);
  const subject = req.body.subject != null ? String(req.body.subject).trim() : row.subject;
  const title = req.body.title != null ? String(req.body.title).trim() : row.title;
  if (!subject || !title) return fail(res, '科目与标题不能为空');
  db.prepare('UPDATE plan_blocks SET subject=?, title=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
    .run(subject, title, id);
  res.json({ ok: true, block: db.prepare('SELECT * FROM plan_blocks WHERE id=?').get(id) });
});

// ---------- 删除（连带清理该时间块产生的提醒）----------
router.delete('/:id', (req, res) => {
  const id = num(req.params.id);
  const row = db.prepare('SELECT id FROM plan_blocks WHERE id=? AND user_id=?').get(id, req.user.uid);
  if (!row) return fail(res, '时间块不存在', 404);
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM reminders WHERE user_id=? AND related_type='plan_block' AND related_id=?").run(req.user.uid, id);
    db.prepare('DELETE FROM plan_blocks WHERE id=?').run(id);
  });
  tx();
  res.json({ ok: true });
});

module.exports = router;
