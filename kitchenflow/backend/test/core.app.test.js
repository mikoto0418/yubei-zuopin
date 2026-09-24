// 执行内核通用套件（注册/登录/401/403/404），使用独立测试库与端口。
'use strict';
process.env.DB_PATH = require('path').join(__dirname, '..', 'data', 'kitchenflow.core.test.db');
process.env.JWT_SECRET = 'kf-core-test-secret';

const fs = require('fs');
for (const suffix of ['', '-shm', '-wal']) {
  try { fs.unlinkSync(process.env.DB_PATH + suffix); } catch { /* 忽略 */ }
}

const { runCoreSuite } = require('./core.test');
const { createApp } = require('../kernel').server;
const { mountRoutes } = require('../routes');
const { seedIfNeeded } = require('../db');

seedIfNeeded();
runCoreSuite({ createApp, mountRoutes, port: 5292 });
