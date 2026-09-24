// 通用 Admin 路由：统计概览 + 用户列表。各系统在概览里补充自己的业务指标。
'use strict';
const express = require('express');
const { ok } = require('./http');
const { auth, adminOnly } = require('./auth');

/**
 * @param {object} deps
 * @param {import('better-sqlite3').Database} deps.db
 * @param {string} deps.userTable
 * @param {() => object} deps.buildOverview  返回该系统的业务统计（由各系统实现）
 */
function adminRoutes({ db, userTable = 'users', buildOverview }) {
  const router = express.Router();
  router.use(auth, adminOnly);

  // 概览：通用用户数 + 各系统自定义指标
  router.get('/overview', (req, res) => {
    const { c: users } = db.prepare(`SELECT COUNT(*) AS c FROM ${userTable}`).get();
    const custom = typeof buildOverview === 'function' ? buildOverview(db) : {};
    return ok(res, { users, ...custom });
  });

  // 用户列表（不含密码）
  router.get('/users', (req, res) => {
    const rows = db.prepare(`SELECT * FROM ${userTable} ORDER BY id ASC`).all()
      .map(({ password, password_hash, ...rest }) => rest);
    return ok(res, rows);
  });

  return router;
}

module.exports = adminRoutes;
