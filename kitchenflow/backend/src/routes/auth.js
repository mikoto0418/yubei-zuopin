// KitchenFlow 认证路由：在内核版本基础上支持注册时选择角色（admin/waiter/chef）。
'use strict';
const express = require('express');
const { ok, fail, requireFields } = require('../http');
const { sign, auth, hashPassword, verifyPassword, publicUser } = require('../auth');

// 本系统允许的角色白名单。注册接口只接受这三种，越界回落 waiter。
const ROLES = ['admin', 'waiter', 'chef'];
const DEFAULT_ROLE = 'waiter';

/**
 * @param {object} deps
 * @param {import('better-sqlite3').Database} deps.db
 * @param {string} deps.userTable
 * @param {string[]} deps.extraColumns  注册时允许写入的扩展列
 */
function authRoutes({ db, userTable = 'users', extraColumns = [] }) {
  const router = express.Router();
  const table = userTable;

  const findByName = db.prepare(`SELECT * FROM ${table} WHERE username = ?`);
  const findById = db.prepare(`SELECT * FROM ${table} WHERE id = ?`);

  // 注册：可选角色（缺省 waiter），密码哈希存储。
  router.post('/register', (req, res) => {
    const b = req.body || {};
    const missing = requireFields(b, ['username', 'password']);
    if (missing) return fail(res, 400, missing);
    const username = String(b.username).trim();
    const password = String(b.password);
    const role = ROLES.includes(b.role) ? b.role : DEFAULT_ROLE;
    if (username.length < 3) return fail(res, 400, '用户名至少 3 位');
    if (password.length < 6) return fail(res, 400, '密码至少 6 位');
    if (findByName.get(username)) return fail(res, 409, '该用户名已被注册');

    const cols = ['username', 'password', 'role'];
    const vals = [username, hashPassword(password), role];
    for (const c of extraColumns) {
      if (b[c] !== undefined) { cols.push(c); vals.push(b[c]); }
    }
    const info = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
    const user = findById.get(info.lastInsertRowid);
    return ok(res, { token: sign({ id: user.id, username: user.username, role: user.role }), user: publicUser(user) }, '注册成功');
  });

  router.post('/login', (req, res) => {
    const b = req.body || {};
    const missing = requireFields(b, ['username', 'password']);
    if (missing) return fail(res, 400, missing);
    const user = findByName.get(String(b.username).trim());
    if (!user || !verifyPassword(String(b.password), user.password)) {
      return fail(res, 401, '用户名或密码错误');
    }
    return ok(res, { token: sign({ id: user.id, username: user.username, role: user.role }), user: publicUser(user) }, '登录成功');
  });

  router.get('/me', auth, (req, res) => {
    const user = findById.get(req.user.id);
    if (!user) return fail(res, 404, '用户不存在');
    return ok(res, publicUser(user));
  });

  router.put('/me', auth, (req, res) => {
    const b = req.body || {};
    const editable = ['nickname', 'avatar', ...extraColumns].filter((c) => b[c] !== undefined);
    if (!editable.length) return fail(res, 400, '没有可更新的字段');
    const sets = editable.map((c) => `${c} = ?`).join(', ');
    db.prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`).run(...editable.map((c) => b[c]), req.user.id);
    return ok(res, publicUser(findById.get(req.user.id)), '已保存');
  });

  return router;
}

module.exports = authRoutes;
