// JWT 鉴权 + RBAC。所有系统共用同一份实现，避免各自手写出错。
'use strict';
require('dotenv').config();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { fail } = require('./http');

// 密钥只从环境变量读。未配置时生成进程级随机密钥（不落盘），
// 避免用固定默认值导致越权；代价是重启后旧 token 失效。
const JWT_SECRET = process.env.JWT_SECRET || process.env.SECRET_KEY || (() => {
  const s = crypto.randomBytes(32).toString('hex');
  console.warn('[auth] 未配置 JWT_SECRET/SECRET_KEY，已生成进程级随机密钥（重启后登录态失效）。');
  return s;
})();

const TOKEN_TTL = process.env.TOKEN_TTL || '7d';

function sign(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

// 认证中间件：解析 Authorization: Bearer <token>
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return fail(res, 401, '未登录或登录已过期');
  try {
    req.user = jwt.verify(token, JWT_SECRET); // { id, username, role }
    next();
  } catch {
    return fail(res, 401, '无效的登录凭证');
  }
}

// 管理员中间件：必须挂在 auth 之后。普通用户访问返回 403（前端据此拦截）。
function adminOnly(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return fail(res, 403, '无权限，需要管理员身份');
}

// 可选认证：有 token 就解析，没有也放行。用于公开列表接口识别"当前用户"。
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch { /* 忽略无效 token */ }
  }
  next();
}

// 去掉密码哈希后再返回给前端。
function publicUser(u) {
  if (!u) return null;
  const { password, password_hash, ...rest } = u;
  return rest;
}

module.exports = { JWT_SECRET, sign, auth, adminOnly, optionalAuth, hashPassword, verifyPassword, publicUser };
