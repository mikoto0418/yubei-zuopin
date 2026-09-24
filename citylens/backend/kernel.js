// 内核统一出口：各系统只从这里取能力，不直接深入内部模块。
//
// 命名约定：*Routes 是路由工厂（返回 Router），requireAuth/adminOnly 是中间件函数。
// 注意 auth 模块整体挂在 `auth` 下（含 sign/hashPassword 等工具），
// 中间件单独以 requireAuth / adminOnly 平铺导出，避免误把模块对象当中间件传给 app.use。
'use strict';

const authModule = require('./src/auth');
const adminRoutes = require('./src/admin');
const crudRoutes = require('./src/crud');
const authRoutes = require('./src/routes/auth');

module.exports = {
  http: require('./src/http'),
  db: require('./src/db'),
  ai: require('./src/ai'),
  server: require('./src/server'),

  // 鉴权工具集：{ JWT_SECRET, sign, auth, adminOnly, optionalAuth, hashPassword, verifyPassword, publicUser }
  auth: authModule,

  // 中间件（平铺，供 app.use 直接使用）
  requireAuth: authModule.auth,
  adminOnly: authModule.adminOnly,
  optionalAuth: authModule.optionalAuth,

  // 路由工厂
  authRoutes,
  adminRoutes,
  crudRoutes,

  // 兼容简写
  crud: crudRoutes,
  admin: adminRoutes,
};
