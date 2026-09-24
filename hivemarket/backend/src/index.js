require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 4104;

// 中间件
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// 统一响应封装：成功(2xx) -> { code, message, data }；错误保留 status + { message }
app.use((req, res, next) => {
  const _json = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === 'object' && !Array.isArray(body) && 'code' in body) {
      return _json(body); // 已封装，直接透传
    }
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return _json({ code: 0, message: 'ok', data: body });
    }
    return _json(body); // 错误由各 handler/全局处理返回 { message }
  };
  next();
});

// 简单请求日志
app.use((req, res, next) => {
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode}`);
  });
  next();
});

// 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/items', require('./routes/items'));
app.use('/api/wants', require('./routes/wants'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/favorites', require('./routes/favorites'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/notifications', require('./routes/notifications'));

// 健康检查
app.get('/api/health', (req, res) => res.json({ status: 'ok', db_alive: !!db, time: new Date().toISOString() }));

// 若前端已构建(存在 frontend/dist)，由后端托管静态资源，实现单端口部署
const distDir = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(distDir, 'index.html')));
  console.log('[static] 已挂载前端构建产物：', distDir);
}

// 404 for /api
app.use('/api', (req, res) => res.status(404).json({ code: -1, message: '接口不存在' }));

// 统一错误处理（兜底：未捕获异常）
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(500).json({ code: -1, message: '服务器内部错误：' + err.message });
});

// 仅当直接运行本文件时启动监听（测试环境 require 时不自动启动）
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`HiveMarket 后端已启动: http://localhost:${PORT}`);
    console.log(`admin 账号: admin / admin123`);
  });
}

module.exports = app;