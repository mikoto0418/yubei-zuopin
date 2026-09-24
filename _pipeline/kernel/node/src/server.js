// Express 应用工厂：装配中间件、错误处理、静态托管与 SPA 兜底。
// 各系统传入自己的路由挂载函数与前端产物目录。
'use strict';
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { fail } = require('./http');

function createApp({ mountRoutes, frontendDir, apiPrefix = '/api' }) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  // 业务路由
  mountRoutes(app, apiPrefix);

  // API 404：未匹配到的 /api 路径统一返回 JSON，而不是 HTML。
  app.use(apiPrefix, (req, res) => fail(res, 404, '接口不存在'));

  // 前端静态托管（可选）：存在构建产物时单端口部署。
  const dist = frontendDir || path.join(__dirname, '..', '..', 'frontend', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
    console.log('[static] 已挂载前端构建产物：', dist);
  }

  // 全局异常：兜底成统一 JSON，避免泄露堆栈。
  app.use((err, req, res, _next) => {
    console.error('[error]', err);
    fail(res, 500, '服务器内部错误，请稍后再试');
  });

  return app;
}

function start(app, port, label) {
  const p = parseInt(port || process.env.PORT, 10) || 3000;
  return app.listen(p, () => {
    console.log(`✅ ${label || '服务'}已启动: http://localhost:${p}`);
  });
}

module.exports = { createApp, start };
