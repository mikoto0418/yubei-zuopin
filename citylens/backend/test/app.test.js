// 复用内核测试套件，只替换装配函数。
'use strict';
const { runCoreSuite } = require('./core.test');
const { createApp } = require('../kernel').server;
const { mountRoutes } = require('../routes');

runCoreSuite({ createApp, mountRoutes, port: 5202 });
