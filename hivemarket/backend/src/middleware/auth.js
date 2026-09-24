const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// 认证中间件：校验 Authorization: Bearer <token>，注入 req.userId / req.role
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ message: '未登录，请先登录' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.id;
    req.role = payload.role;
    next();
  } catch (e) {
    return res.status(401).json({ message: '登录已失效，请重新登录' });
  }
}

// 软认证：有 token 则解析并注入身份，无 token 也可继续（用于推荐等可选登录接口）
function authSoft(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.userId = payload.id;
      req.role = payload.role;
    } catch (e) { /* 忽略无效 token */ }
  }
  next();
}

// admin 权限中间件：必须位于 auth 之后
function adminOnly(req, res, next) {
  if (req.role !== 'admin') return res.status(403).json({ message: '无权限访问' });
  next();
}

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

module.exports = { auth, authSoft, adminOnly, signToken };