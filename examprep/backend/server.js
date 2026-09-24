require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const { seedIfNeeded } = require('./db');

const app = express();
app.set('json spaces', 2);
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// API 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/subjects', require('./routes/subjects'));
app.use('/api/goals', require('./routes/goals'));
app.use('/api/plans', require('./routes/plans'));
app.use('/api/blocks', require('./routes/blocks'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/exams', require('./routes/exams'));
app.use('/api/wrong', require('./routes/wrong'));
app.use('/api/materials', require('./routes/materials'));
app.use('/api/reminders', require('./routes/reminders'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/admin', require('./routes/admin'));

// 健康检查
app.get('/api/health', (req, res) => res.json({ ok: true, name: 'ExamPrep', ts: Date.now() }));

// 未匹配的 /api 路由统一返回结构化 404
app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, message: `接口不存在: ${req.method} ${req.path}` });
});

// 静态托管前端（前端/ + 后端统一服务）
const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

// 兜底：非 /api 路由都回 index.html（SPA）
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// 统一错误处理
app.use((err, req, res, next) => {
  // JSON 解析失败（非法请求体）
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, message: '请求体不是合法的 JSON' });
  }
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ ok: false, message: err.message || '服务器内部错误' });
});

const PORT = process.env.PORT || 4105;

if (require.main === module) {
  seedIfNeeded();
  app.listen(PORT, () => {
    console.log(` ExamPrep 服务已启动: http://localhost:${PORT}`);
    console.log(` 前端(Apple 设计基底 + 命令行 + 时间块日历) : http://localhost:${PORT}/`);
    console.log(` 管理员账号      : admin / admin123`);
    console.log(` 演示账号        : demo / demo123`);
    console.log(` 助教账号        : student1 / student123`);
  });
}

module.exports = app;
