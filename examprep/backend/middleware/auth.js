const jwt = require('jsonwebtoken');

// 优先使用规范约定的 SECRET_KEY，兼容旧 JWT_SECRET，兜底默认值
const JWT_SECRET = process.env.SECRET_KEY || process.env.JWT_SECRET || 'exam-prep-dev-secret-change-me';

// 角色：admin（管理员）/ mentor（助教，可审阅所有学员数据）/ student（学员，仅本人数据）
const ROLES = ['admin', 'mentor', 'student'];

function signToken(user, expiresIn = '7d') {
  return jwt.sign(
    { uid: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn }
  );
}

// 认证中间件：解析 Bearer token，挂载 req.user
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ ok: false, message: '未登录或登录已过期' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, message: '登录凭证无效' });
  }
}

// 要求 admin
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, message: '需要管理员权限' });
  }
  next();
}

// 要求 admin 或 mentor（可查看全站/学员数据）
function requireMentor(req, res, next) {
  if (!req.user || !['admin', 'mentor'].includes(req.user.role)) {
    return res.status(403).json({ ok: false, message: '需要助教或管理员权限' });
  }
  next();
}

module.exports = { auth, requireAdmin, requireMentor, signToken, JWT_SECRET, ROLES };
