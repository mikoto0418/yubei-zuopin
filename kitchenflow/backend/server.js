// KitchenFlow 服务入口：种子 + 装配 + 启动（端口 4201）。
'use strict';
require('dotenv').config();
const { createApp, start } = require('./kernel').server;
const { mountRoutes } = require('./routes');
const { seedIfNeeded } = require('./db');

seedIfNeeded();

const app = createApp({ mountRoutes });
const PORT = process.env.PORT || 4201;
start(app, PORT, 'KitchenFlow 后厨订单系统');

module.exports = { app };
