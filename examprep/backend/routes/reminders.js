const express = require('express');
const { db, dayOffset } = require('../db');
const { auth } = require('../middleware/auth');
const { fail, num, paging } = require('./util');

const router = express.Router();
router.use(auth);

// 提醒状态机：pending → sent → done（可 dismiss）
const REM_STATUSES = ['pending', 'sent', 'done', 'dismissed'];
const REM_TRANSITIONS = {
  pending: ['sent', 'done', 'dismissed'],
  sent: ['done', 'dismissed'],
  done: [],
  dismissed: [],
};
const CHANNELS = ['app', 'sms', 'email'];

// ---------- 概览（先于 /:id 注册）----------
router.get('/summary', (req, res) => {
  const uid = req.user.uid;
  const rows = db.prepare('SELECT status, channel FROM reminders WHERE user_id=?').all(uid);
  const byStatus = { pending: 0, sent: 0, done: 0, dismissed: 0 };
  const byChannel = {};
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    byChannel[r.channel] = (byChannel[r.channel] || 0) + 1;
  }
  // 逾期未完成：pending/sent 且 remind_at 早于当前
  const now = `${dayOffset(0)} ${new Date().toTimeString().slice(0, 5)}`;
  const overdue = db.prepare(
    "SELECT COUNT(*) AS c FROM reminders WHERE user_id=? AND status IN ('pending','sent') AND remind_at < ?"
  ).get(uid, now).c;
  res.json({ ok: true, total: rows.length, by_status: byStatus, by_channel: byChannel, overdue });
});

// ---------- 未完成计划自动补做提醒（扫描 + 落库）----------
router.post('/scan', (req, res) => {
  const uid = req.user.uid;
  const yesterday = dayOffset(-1);
  // 昨天仍未完成的时间块 → 生成补做提醒（同一时间块不重复生成）
  const missed = db.prepare(`
    SELECT b.* FROM plan_blocks b
    WHERE b.user_id = ? AND b.block_date <= ? AND b.status IN ('planned','in_progress')
      AND NOT EXISTS (
        SELECT 1 FROM reminders r
        WHERE r.user_id = b.user_id AND r.related_type = 'plan_block' AND r.related_id = b.id
          AND r.title LIKE '%补做%'
      )
    ORDER BY b.block_date DESC LIMIT 50
  `).all(uid, yesterday);

  const ins = db.prepare(`
    INSERT INTO reminders (user_id,title,remind_at,related_type,related_id,status,channel)
    VALUES (?,?,?,?,?,'pending','app')
  `);
  const tx = db.transaction(() => {
    for (const b of missed) {
      ins.run(uid, `未完成计划补做：${b.subject}·${b.title}（${b.block_date}）`,
        `${dayOffset(0)} 22:00`, 'plan_block', b.id);
    }
  });
  tx();
  res.json({ ok: true, created: missed.length });
});

// ---------- 列表（分页 + 状态/渠道筛选）----------
router.get('/', (req, res) => {
  let where = 'user_id = ?';
  const params = [req.user.uid];
  if (REM_STATUSES.includes(req.query.status)) { where += ' AND status = ?'; params.push(req.query.status); }
  if (CHANNELS.includes(req.query.channel)) { where += ' AND channel = ?'; params.push(req.query.channel); }
  if (req.query.q) { where += ' AND title LIKE ?'; params.push(`%${req.query.q}%`); }

  const usePage = req.query.page != null || req.query.pageSize != null;
  if (usePage) {
    const { page, pageSize, offset } = paging(req, 20, 100);
    const total = db.prepare(`SELECT COUNT(*) AS c FROM reminders WHERE ${where}`).get(...params).c;
    const rows = db.prepare(
      `SELECT * FROM reminders WHERE ${where} ORDER BY remind_at DESC, id DESC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, offset);
    return res.json({ ok: true, reminders: rows, total, page, pageSize });
  }
  const rows = db.prepare(
    `SELECT * FROM reminders WHERE ${where} ORDER BY remind_at DESC, id DESC`
  ).all(...params);
  res.json({ ok: true, reminders: rows });
});

// ---------- 详情 ----------
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM reminders WHERE id=? AND user_id=?').get(num(req.params.id), req.user.uid);
  if (!row) return fail(res, '提醒不存在', 404);
  res.json({ ok: true, reminder: row });
});

// ---------- 新建提醒 ----------
router.post('/', (req, res) => {
  const { title, remind_at, related_type, related_id, channel } = req.body || {};
  if (!title || !String(title).trim()) return fail(res, '提醒标题不能为空');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(remind_at || ''))) {
    return fail(res, '提醒时间格式应为 YYYY-MM-DD HH:MM');
  }
  const info = db.prepare(`
    INSERT INTO reminders (user_id,title,remind_at,related_type,related_id,status,channel)
    VALUES (?,?,?,?,?,'pending',?)
  `).run(
    req.user.uid, String(title).trim(), String(remind_at).trim(),
    String(related_type || '').trim() || null,
    related_id != null ? num(related_id) : null,
    CHANNELS.includes(channel) ? channel : 'app'
  );
  res.status(201).json({ ok: true, reminder: db.prepare('SELECT * FROM reminders WHERE id=?').get(info.lastInsertRowid) });
});

// ---------- 状态流转 ----------
router.put('/:id/status', (req, res) => {
  const id = num(req.params.id);
  const row = db.prepare('SELECT * FROM reminders WHERE id=? AND user_id=?').get(id, req.user.uid);
  if (!row) return fail(res, '提醒不存在', 404);
  const to = String((req.body || {}).status || '');
  if (!REM_STATUSES.includes(to)) return fail(res, `状态非法，可选：${REM_STATUSES.join(' / ')}`);
  if (to === row.status) return fail(res, `提醒已处于 ${to} 状态`);
  if (!(REM_TRANSITIONS[row.status] || []).includes(to)) {
    return fail(res, `非法状态流转：${row.status} → ${to}（${row.status} 为${(REM_TRANSITIONS[row.status] || []).length ? '' : '终态，不可再流转'}）`);
  }
  db.prepare('UPDATE reminders SET status=? WHERE id=?').run(to, id);
  res.json({ ok: true, reminder: db.prepare('SELECT * FROM reminders WHERE id=?').get(id) });
});

// ---------- 编辑 ----------
router.put('/:id', (req, res) => {
  const id = num(req.params.id);
  const row = db.prepare('SELECT * FROM reminders WHERE id=? AND user_id=?').get(id, req.user.uid);
  if (!row) return fail(res, '提醒不存在', 404);
  const title = req.body.title != null ? String(req.body.title).trim() : row.title;
  if (!title) return fail(res, '提醒标题不能为空');
  const remind_at = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(req.body.remind_at || '')) ? req.body.remind_at : row.remind_at;
  const channel = CHANNELS.includes(req.body.channel) ? req.body.channel : row.channel;
  db.prepare('UPDATE reminders SET title=?, remind_at=?, channel=? WHERE id=?').run(title, remind_at, channel, id);
  res.json({ ok: true, reminder: db.prepare('SELECT * FROM reminders WHERE id=?').get(id) });
});

// ---------- 删除 ----------
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM reminders WHERE id=? AND user_id=?').run(num(req.params.id), req.user.uid);
  if (!info.changes) return fail(res, '提醒不存在', 404);
  res.json({ ok: true });
});

module.exports = router;
