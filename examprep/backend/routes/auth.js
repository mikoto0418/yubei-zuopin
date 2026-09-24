const express = require('express');
const { db, publicUser, hashPassword, verifyPassword, dayOffset } = require('../db');
const { signToken, auth } = require('../middleware/auth');

const router = express.Router();
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const ROLES = ['admin', 'mentor', 'student'];

// 注册（默认 student 角色）
router.post('/register', (req, res) => {
  const { username, password, target_exam, exam_date } = req.body || {};
  const uname = username && String(username).trim();
  if (!uname) return res.status(400).json({ ok: false, message: '用户名不能为空' });
  if (String(uname).length > 32) return res.status(400).json({ ok: false, message: '用户名不能超过 32 位' });
  if (!password) return res.status(400).json({ ok: false, message: '密码不能为空' });
  if (String(password).length < 6) return res.status(400).json({ ok: false, message: '密码至少 6 位' });
  if (exam_date && !isDate(exam_date)) return res.status(400).json({ ok: false, message: '考试日期格式应为 YYYY-MM-DD' });
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(uname);
  if (exists) return res.status(409).json({ ok: false, message: '用户名已存在' });
  const supported = ['考研', '四六级', '考公'];
  const exam = supported.includes(target_exam) ? target_exam : '考研';
  const info = db.prepare(
    'INSERT INTO users (username,password_hash,role,target_exam,exam_date) VALUES (?,?,?,?,?)'
  ).run(uname, hashPassword(password), 'student', exam, exam_date || null);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ok: true, user: publicUser(user), token: signToken(user) });
});

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = username ? db.prepare('SELECT * FROM users WHERE username = ?').get(username) : null;
  if (!user || !verifyPassword(password || '', user.password_hash)) {
    return res.status(401).json({ ok: false, message: '用户名或密码错误' });
  }
  res.json({ ok: true, user: publicUser(user), token: signToken(user) });
});

// 当前用户信息
router.get('/me', auth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.uid);
  res.json({ ok: true, user: publicUser(user) });
});

// 更新目标考试/考试日期
router.put('/me', auth, (req, res) => {
  const { target_exam, exam_date } = req.body || {};
  if (exam_date && !isDate(exam_date)) return res.status(400).json({ ok: false, message: '考试日期格式应为 YYYY-MM-DD' });
  const supported = ['考研', '四六级', '考公'];
  const exam = supported.includes(target_exam) ? target_exam : undefined;
  const stmt = db.prepare('UPDATE users SET ' +
    (exam ? 'target_exam = @exam,' : '') + ' exam_date = @date WHERE id = @id');
  stmt.run({ exam, date: exam_date || null, id: req.user.uid });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.uid);
  res.json({ ok: true, user: publicUser(user) });
});

// 个人信息概览（含新业务模块的关键指标）
router.get('/overview', auth, (req, res) => {
  const uid = req.user.uid;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);

  const allGoals = db.prepare('SELECT * FROM goals WHERE user_id = ?').all(uid);
  const totalTargetW = allGoals.reduce((s, g) => s + g.target * g.weight, 0);
  const totalProgressW = allGoals.reduce((s, g) => s + g.progress * g.weight, 0);

  const taskRows = db.prepare('SELECT total, correct FROM tasks WHERE user_id = ?').all(uid);
  const totalQ = taskRows.reduce((s, t) => s + (t.total || 0), 0);
  const correctQ = taskRows.reduce((s, t) => s + (t.correct || 0), 0);
  const accuracy = totalQ ? Math.round((correctQ / totalQ) * 100) : 0;

  const today = dayOffset(0);
  const todayHours = (db.prepare('SELECT hours FROM stats WHERE user_id = ? AND stat_date = ?').get(uid, today) || {}).hours || 0;

  const examDate = user.exam_date;
  let daysLeft = null;
  if (examDate) daysLeft = Math.max(0, Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000));

  // 今日时间块完成情况
  const todayBlocks = db.prepare(
    'SELECT status FROM plan_blocks WHERE user_id=? AND block_date=?'
  ).all(uid, today);
  const blockDone = todayBlocks.filter((b) => b.status === 'done').length;
  const blockSkipped = todayBlocks.filter((b) => b.status === 'skipped').length;

  // 最近一次模考
  const lastMock = db.prepare(
    'SELECT exam_name, exam_date, total_score, full_score FROM mock_exams WHERE user_id=? ORDER BY exam_date DESC, id DESC LIMIT 1'
  ).get(uid);

  // 错题本掌握率
  const wrongRows = db.prepare('SELECT status FROM wrong_questions WHERE user_id=?').all(uid);
  const wrongMastered = wrongRows.filter((w) => w.status === 'mastered').length;

  // 资料阅读进度
  const matRows = db.prepare('SELECT total_pages, read_pages FROM study_materials WHERE user_id=?').all(uid);
  const matPages = matRows.reduce((s, m) => s + (m.total_pages || 0), 0);
  const matRead = matRows.reduce((s, m) => s + (m.read_pages || 0), 0);

  // 待处理提醒
  const pendingReminders = db.prepare(
    "SELECT COUNT(*) AS c FROM reminders WHERE user_id=? AND status='pending'"
  ).get(uid).c;

  res.json({
    ok: true,
    overview: {
      username: user.username,
      role: user.role,
      target_exam: user.target_exam,
      exam_date: examDate,
      days_left: daysLeft,
      goal_progress: totalTargetW ? Math.round((totalProgressW / totalTargetW) * 100) : 0,
      accuracy,
      today_hours: todayHours,
      plan_done: blockDone,
      plan_total: todayBlocks.length,
      plan_skipped: blockSkipped,
      last_mock: lastMock || null,
      wrong_total: wrongRows.length,
      wrong_mastered: wrongMastered,
      material_progress: matPages ? Math.round(matRead / matPages * 100) : 0,
      pending_reminders: pendingReminders,
    },
  });
});

module.exports = router;
void ROLES;
