// 通用认证路由：注册 / 登录 / 当前用户 / 改资料。
// 各系统通过 options 声明自己的用户表扩展字段（如 campus、target_exam）。
'use strict';
const express = require('express');
const { ok, fail, requireFields } = require('../http');
const { sign, auth, hashPassword, verifyPassword, publicUser } = require('../auth');

/**
 * @param {object} deps
 * @param {import('better-sqlite3').Database} deps.db
 * @param {string} deps.userTable          用户表名，默认 users
 * @param {string[]} deps.extraColumns     注册时允许写入的扩展列（如 ['campus']）
 * @param {(row:object)=>object} deps.shape 自定义返回结构（可选）
 */
function authRoutes({ db, userTable = 'users', extraColumns = [], shape }) {
  const router = express.Router();
  const table = userTable;

  const findByName = db.prepare(`SELECT * FROM ${table} WHERE username = ?`);
  const findById = db.prepare(`SELECT * FROM ${table} WHERE id = ?`);
  const present = shape || publicUser;

  // 注册：用户名唯一，密码哈希存储，默认普通用户。
  router.post('/register', (req, res) => {
    const b = req.body || {};
    const missing = requireFields(b, ['username', 'password']);
    if (missing) return fail(res, 400, missing);
    const username = String(b.username).trim();
    const password = String(b.password);
    if (username.length < 3) return fail(res, 400, '用户名至少 3 位');
    if (password.length < 6) return fail(res, 400, '密码至少 6 位');
    if (findByName.get(username)) return fail(res, 409, '该用户名已被注册');

    const cols = ['username', 'password', 'role'];
    const vals = [username, hashPassword(password), 'user'];
    for (const c of extraColumns) {
      if (b[c] !== undefined) { cols.push(c); vals.push(b[c]); }
    }
    const placeholders = cols.map(() => '?').join(',');
    const info = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`).run(...vals);
    const user = findById.get(info.lastInsertRowid);
    return ok(res, { token: sign({ id: user.id, username: user.username, role: user.role }), user: present(user) }, '注册成功');
  });

  // 登录：返回 JWT 与用户信息。
  router.post('/login', (req, res) => {
    const b = req.body || {};
    const missing = requireFields(b, ['username', 'password']);
    if (missing) return fail(res, 400, missing);
    const user = findByName.get(String(b.username).trim());
    if (!user || !verifyPassword(String(b.password), user.password)) {
      return fail(res, 401, '用户名或密码错误');
    }
    return ok(res, { token: sign({ id: user.id, username: user.username, role: user.role }), user: present(user) }, '登录成功');
  });

  // 当前登录用户。
  router.get('/me', auth, (req, res) => {
    const user = findById.get(req.user.id);
    if (!user) return fail(res, 404, '用户不存在');
    return ok(res, present(user));
  });

  // 改资料：只允许改非敏感字段。
  router.put('/me', auth, (req, res) => {
    const b = req.body || {};
    const editable = ['nickname', 'avatar', ...extraColumns].filter((c) => b[c] !== undefined);
    if (!editable.length) return fail(res, 400, '没有可更新的字段');
    const sets = editable.map((c) => `${c} = ?`).join(', ');
    db.prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`).run(...editable.map((c) => b[c]), req.user.id);
    return ok(res, present(findById.get(req.user.id)), '已保存');
  });

  return router;
}

module.exports = authRoutes;
