// 复用测试套件，只替换装配函数。
'use strict';
const { runSuite } = require('./core.test');
const { createApp } = require('../kernel').server;
const { mountRoutes } = require('../routes');

// 用独立端口与独立库，避免与开发库/其他系统冲突。
runSuite({ createApp, mountRoutes, port: 5205 });
