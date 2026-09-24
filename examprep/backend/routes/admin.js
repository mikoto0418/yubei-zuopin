const express = require('express');
const { db } = require('../db');
const { auth, requireMentor } = require('../middleware/auth');

const router = express.Router();
// admin 与 mentor 均可访问；写操作（改角色）另用 requireAdmin 收口
router.use(auth, requireMentor);

// 数据仪表盘看板数据
router.get('/dashboard', (req, res) => {
  const users = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const goalsCount = db.prepare('SELECT COUNT(*) AS c FROM goals').get().c;
  const plansDone = db.prepare('SELECT COUNT(*) AS c FROM plans WHERE done=1').get().c;
  const plansTotal = db.prepare('SELECT COUNT(*) AS c FROM plans').get().c;

  const activeUsers = db.prepare(`
    SELECT COUNT(DISTINCT user_id) AS c FROM (
      SELECT user_id FROM plans WHERE plan_date >= date('now','-7 day')
      UNION SELECT user_id FROM tasks WHERE created_at >= date('now','-7 day')
      UNION SELECT user_id FROM stats WHERE stat_date >= date('now','-7 day')
      UNION SELECT user_id FROM plan_blocks WHERE block_date >= date('now','-7 day')
    )
  `).get().c;

  const accRows = db.prepare('SELECT subject, total, correct FROM tasks').all();
  const accMap = {};
  for (const r of accRows) {
    accMap[r.subject] = accMap[r.subject] || { total: 0, correct: 0 };
    accMap[r.subject].total += r.total || 0;
    accMap[r.subject].correct += r.correct || 0;
  }
  const subjectAccuracy = Object.keys(accMap).map((s) => ({
    subject: s,
    accuracy: accMap[s].total ? Math.round(accMap[s].correct / accMap[s].total * 100) : 0,
  }));

  const trendRows = db.prepare(
    'SELECT stat_date, SUM(hours) AS hours FROM stats WHERE stat_date >= date(?, ?) GROUP BY stat_date ORDER BY stat_date'
  ).all('now', '-13 day');
  const trend = trendRows.map((r) => ({ date: r.stat_date, hours: Math.round(r.hours * 10) / 10 }));

  const goalRows = db.prepare('SELECT target, progress FROM goals').all();
  const goalDone = goalRows.filter((g) => g.target > 0 && g.progress >= g.target).length;
  const goalTarget = goalRows.reduce((s, g) => s + g.target, 0) || 0;
  const goalProgress = goalRows.reduce((s, g) => s + g.progress, 0) || 0;

  const examDist = db.prepare('SELECT target_exam AS exam, COUNT(*) AS c FROM users GROUP BY target_exam').all();
  const roleDist = db.prepare('SELECT role, COUNT(*) AS c FROM users GROUP BY role').all();

  const goalPct = goalTarget ? goalProgress / goalTarget : 0;
  const avgHours = trend.length ? trend.reduce((s, t) => s + t.hours, 0) / trend.length : 0;
  const predicted = Math.max(0, Math.min(100, Math.round(goalPct * 70 + Math.min(avgHours / 8, 1) * 30)));

  // 新模块统计
  const blockStats = db.prepare(
    'SELECT status, COUNT(*) AS c FROM plan_blocks GROUP BY status'
  ).all();
  const blocksByStatus = { planned: 0, in_progress: 0, done: 0, skipped: 0 };
  for (const b of blockStats) blocksByStatus[b.status] = b.c;

  const wrongStats = db.prepare(
    'SELECT status, COUNT(*) AS c FROM wrong_questions GROUP BY status'
  ).all();
  const wrongByStatus = { new: 0, reviewing: 0, mastered: 0 };
  for (const w of wrongStats) wrongByStatus[w.status] = w.c;

  const mockAgg = db.prepare(
    'SELECT COUNT(*) AS c, AVG(total_score) AS avg_score FROM mock_exams'
  ).get();

  const materialAgg = db.prepare(
    'SELECT COUNT(*) AS c, SUM(total_pages) AS pages, SUM(read_pages) AS read_pages FROM study_materials'
  ).get();

  const reminderPending = db.prepare(
    "SELECT COUNT(*) AS c FROM reminders WHERE status='pending'"
  ).get().c;

  res.json({
    ok: true,
    dashboard: {
      users,
      goals_count: goalsCount,
      active_users: activeUsers,
      plan_done_rate: plansTotal ? Math.round(plansDone / plansTotal * 100) : 0,
      subject_accuracy: subjectAccuracy,
      trend,
      goal_achieved: goalDone,
      goal_total: goalRows.length,
      goal_target: goalTarget,
      goal_progress: goalProgress,
      predicted_level: predicted,
      exam_distribution: examDist,
      role_distribution: roleDist,
      blocks_by_status: blocksByStatus,
      blocks_total: Object.values(blocksByStatus).reduce((s, n) => s + n, 0),
      wrong_by_status: wrongByStatus,
      wrong_total: Object.values(wrongByStatus).reduce((s, n) => s + n, 0),
      mock_count: mockAgg.c || 0,
      mock_avg_score: mockAgg.avg_score ? Math.round(mockAgg.avg_score * 10) / 10 : 0,
      material_count: materialAgg.c || 0,
      material_progress: materialAgg.pages ? Math.round(materialAgg.read_pages / materialAgg.pages * 100) : 0,
      reminder_pending: reminderPending,
    },
  });
});

// 用户列表（支持 ?q= 搜索 / 分页 / ?role= 筛选）
router.get('/users', (req, res) => {
  let where = '1=1';
  const params = [];
  if (req.query.q) { where += ' AND u.username LIKE ?'; params.push(`%${req.query.q}%`); }
  if (['student', 'mentor', 'admin'].includes(req.query.role)) { where += ' AND u.role = ?'; params.push(req.query.role); }

  const countQ = `SELECT COUNT(*) AS c FROM users u WHERE ${where}`;
  const selectQ = `
    SELECT u.id, u.username, u.role, u.target_exam, u.exam_date, u.created_at,
      (SELECT COUNT(*) FROM goals g WHERE g.user_id = u.id) AS goals,
      (SELECT COUNT(*) FROM tasks t WHERE t.user_id = u.id) AS tasks,
      (SELECT COUNT(*) FROM plan_blocks b WHERE b.user_id = u.id) AS blocks,
      (SELECT COUNT(*) FROM wrong_questions w WHERE w.user_id = u.id) AS wrongs,
      (SELECT COUNT(*) FROM mock_exams m WHERE m.user_id = u.id) AS mocks
    FROM users u WHERE ${where} ORDER BY u.created_at ASC`;

  const usePage = req.query.page != null || req.query.pageSize != null;
  if (usePage) {
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(req.query.pageSize) || 20)));
    const total = db.prepare(countQ).get(...params).c;
    const rows = db.prepare(selectQ + ' LIMIT ? OFFSET ?').all(...params, pageSize, (page - 1) * pageSize);
    return res.json({ ok: true, users: rows, total, page, pageSize });
  }

  res.json({ ok: true, users: db.prepare(selectQ).all(...params) });
});

module.exports = router;
