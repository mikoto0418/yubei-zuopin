// ScriptForge 服务入口（端口 4204）。
'use strict';
require('dotenv').config();
const { createApp, start } = require('./kernel').server;
const { mountRoutes } = require('./routes');
const { seedIfNeeded } = require('./seed');

seedIfNeeded();

const app = createApp({ mountRoutes });
const PORT = process.env.PORT || 4204;
start(app, PORT, 'ScriptForge');

module.exports = { app };
