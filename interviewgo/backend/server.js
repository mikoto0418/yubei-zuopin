// InterviewGo 服务入口。
'use strict';
require('dotenv').config();
const { createApp, start } = require('./kernel').server;
const { mountRoutes } = require('./routes');
const { seedIfNeeded } = require('./db');

seedIfNeeded();

const app = createApp({ mountRoutes });
const PORT = process.env.PORT || 4203;
start(app, PORT, 'InterviewGo');

module.exports = { app };
