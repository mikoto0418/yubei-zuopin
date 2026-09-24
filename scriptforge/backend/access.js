// 权限判定：ScriptForge 有三种角色。
//   admin  —— 平台管理员，可读写全部
//   writer —— 编剧，只能读写自己的作品及其下级资源
//   editor —— 责编，可读全部作品用于审阅，但只能改自己的（不能替编剧改稿）
//
// 参数顺序统一为 (row, user)，与 crud.js 里 canReadRow(row, user) / canWriteRow(row, user)
// 的调用约定一致 —— 顺序写反会让所有写操作误判为 403。
'use strict';

const READ_ALL_ROLES = ['admin', 'editor'];
const WRITE_ALL_ROLES = ['admin'];

function canReadAll(user) {
  return !!user && READ_ALL_ROLES.includes(user.role);
}

function canWriteAll(user) {
  return !!user && WRITE_ALL_ROLES.includes(user.role);
}

// 读：admin/editor 通吃；writer 只能读自己的
function canRead(row, user) {
  if (!user) return false;
  if (canReadAll(user)) return true;
  return !!row && row.user_id === user.id;
}

// 写：admin 通吃；其余只能写自己的
function canWrite(row, user) {
  if (!user) return false;
  if (canWriteAll(user)) return true;
  return !!row && row.user_id === user.id;
}

// 审阅动作（通过 / 返修）：admin 与 editor 都可执行，是责编的核心权限
function canReview(user) {
  return !!user && ['admin', 'editor'].includes(user.role);
}

// 列表查询时的归属范围：返回 null 表示不加限制
function ownerScope(user) {
  return canReadAll(user) ? null : user.id;
}

module.exports = { canRead, canWrite, canReview, canReadAll, canWriteAll, ownerScope };
