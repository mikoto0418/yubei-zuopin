require('dotenv').config();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { fail } = require('./http');

// JWT 签名密钥：仅从环境变量读取，严禁硬编码进源码。
// 兜底时生成进程级随机密钥（不落盘），避免使用固定默认值导致越权；重启后旧 token 会失效。
const JWT_SECRET = process.env.JWT_SECRET || process.env.SECRET_KEY || (() => {
  const s = crypto.randomBytes(32).toString('hex');
  console.warn('[middleware] 未配置 JWT_SECRET/SECRET_KEY，已生成进程级随机密钥（重启后登录态失效）。');
  return s;
})();

function sign(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

// 认证中间件：解析 Authorization: Bearer <token>
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return fail(res, 401, '未登录或登录已过期');
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, username, role }
    next();
  } catch {
    return fail(res, 401, '无效的登录凭证');
  }
}

// 管理员中间件：必须在 auth 之后使用
function adminOnly(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return fail(res, 403, '无权限，需要管理员身份');
}

module.exports = { JWT_SECRET, sign, auth, adminOnly };