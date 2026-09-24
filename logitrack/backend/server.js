// LogiTrack 服务入口。
'use strict';
require('dotenv').config();
const { createApp, start } = require('./kernel').server;
const { mountRoutes } = require('./routes');
const { seedIfNeeded } = require('./db');

seedIfNeeded();

const app = createApp({ mountRoutes });
const PORT = process.env.PORT || 4205;
start(app, PORT, 'LogiTrack 物流运单跟踪平台');

module.exports = { app };
