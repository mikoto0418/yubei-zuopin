const express = require('express');
const db = require('../db');
const { auth, adminOnly } = require('../middleware/auth');
const { notify } = require('../services/notify');

const router = express.Router();

const REASONS = ['虚假描述', '价格欺诈', '违禁物品', '恶意骚扰', '交易不履约', '重复发布', '其他'];
const TYPES = ['item', 'user'];
const STATUSES = ['pending', 'approved', 'rejected'];

// 我的举报（?all=1 管理员可看全部）
router.get('/', auth, (req, res) => {
  const isAdmin = req.role === 'admin';
  const seeAll = isAdmin && String(req.query.all || '') === '1';
  const status = req.query.status;
  const where = [];
  const params = [];
  if (!seeAll) { where.push('rp.reporter_id = ?'); params.push(req.userId); }
  if (status && STATUSES.includes(status)) { where.push('rp.status = ?'); params.push(status); }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';

  const reports = db.prepare(
    `SELECT rp.*, u.nickname AS reporter_nickname, h.nickname AS handler_nickname,
            CASE rp.target_type
              WHEN 'item' THEN (SELECT title FROM items WHERE id = rp.target_id)
              WHEN 'user' THEN (SELECT nickname FROM users WHERE id = rp.target_id)
            END AS target_name
     FROM reports rp
     LEFT JOIN users u ON rp.reporter_id = u.id
     LEFT JOIN users h ON rp.handled_by = h.id${whereSql}
     ORDER BY CASE rp.status WHEN 'pending' THEN 0 ELSE 1 END, rp.created_at DESC, rp.id DESC`
  ).all(...params);

  const counts = {
    pending: db.prepare("SELECT COUNT(*) AS c FROM reports WHERE status = 'pending'").get().c,
    approved: db.prepare("SELECT COUNT(*) AS c FROM reports WHERE status = 'approved'").get().c,
    rejected: db.prepare("SELECT COUNT(*) AS c FROM reports WHERE status = 'rejected'").get().c,
  };
  res.json({ reports, counts, reasons: REASONS });
});

// 举报详情
router.get('/:id', auth, (req, res) => {
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!report) return res.status(404).json({ message: '举报不存在' });
  if (report.reporter_id !== req.userId && req.role !== 'admin') {
    return res.status(403).json({ message: '无权查看该举报' });
  }
  res.json({ report });
});

// 提交举报
router.post('/', auth, (req, res) => {
  const { target_type, target_id, reason, detail = '' } = req.body || {};
  if (!TYPES.includes(target_type)) return res.status(400).json({ message: '举报对象类型不合法' });
  if (!REASONS.includes(reason)) return res.status(400).json({ message: `举报原因不合法（可选：${REASONS.join('/')}）` });
  if (String(detail).length > 500) return res.status(400).json({ message: '补充说明过长（不超过 500 字）' });

  const tid = Number(target_id);
  if (!tid) return res.status(400).json({ message: '请提供举报对象 id' });

  if (target_type === 'item') {
    const item = db.prepare('SELECT id, seller_id FROM items WHERE id = ?').get(tid);
    if (!item) return res.status(404).json({ message: '被举报的商品不存在' });
    if (item.seller_id === req.userId) return res.status(400).json({ message: '不能举报自己的商品' });
  } else {
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(tid);
    if (!user) return res.status(404).json({ message: '被举报的用户不存在' });
    if (tid === req.userId) return res.status(400).json({ message: '不能举报自己' });
  }

  const dup = db.prepare(
    "SELECT id FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = 'pending'"
  ).get(req.userId, target_type, tid);
  if (dup) return res.status(409).json({ message: '你已举报过该对象，等待平台处理' });

  const info = db.prepare(
    'INSERT INTO reports (reporter_id, target_type, target_id, reason, detail) VALUES (?, ?, ?, ?, ?)'
  ).run(req.userId, target_type, tid, reason, String(detail || ''));

  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(info.lastInsertRowid);
  res.json({ message: '举报已提交，平台会尽快处理', report });
});

// 管理员审核：通过 / 驳回
router.patch('/:id', auth, adminOnly, (req, res) => {
  const { status, handle_note = '' } = req.body || {};
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: '审核结果只能是 approved / rejected' });
  }
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!report) return res.status(404).json({ message: '举报不存在' });
  if (report.status !== 'pending') return res.status(400).json({ message: '该举报已处理，不能重复审核' });

  db.transaction(() => {
    db.prepare(
      "UPDATE reports SET status = ?, handled_by = ?, handle_note = ?, handled_at = datetime('now','localtime') WHERE id = ?"
    ).run(status, req.userId, String(handle_note || ''), report.id);

    // 通过：商品下架 / 用户扣信用分
    if (status === 'approved') {
      if (report.target_type === 'item') {
        db.prepare("UPDATE items SET status = '下架' WHERE id = ?").run(report.target_id);
      } else {
        db.prepare('UPDATE users SET credit_score = MAX(credit_score - 10, 0) WHERE id = ?').run(report.target_id);
      }
    }
  })();

  notify(report.reporter_id, {
    type: 'report',
    title: `你的举报已${status === 'approved' ? '通过' : '驳回'}`,
    body: status === 'approved'
      ? `平台已核实并处理（${report.reason}）。${handle_note ? `处理说明：${handle_note}` : ''}`
      : `平台核实后未予处理。${handle_note ? `说明：${handle_note}` : ''}`,
    link: '/reports',
  });

  const updated = db.prepare('SELECT * FROM reports WHERE id = ?').get(report.id);
  res.json({ message: status === 'approved' ? '举报已通过并处理' : '举报已驳回', report: updated });
});

module.exports = router;
