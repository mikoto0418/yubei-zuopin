// 通知写入助手：所有业务动作（下单/流转/评价/举报处理/消息）统一走这里
const db = require('../db');

const insStmt = () => db.prepare(
  'INSERT INTO notifications (user_id, type, title, body, link, read) VALUES (?, ?, ?, ?, ?, 0)'
);

/**
 * 写入一条通知。
 * @param {number} userId 接收者
 * @param {{type?:string,title:string,body?:string,link?:string}} payload
 * @returns {number|null} 通知 id
 */
function notify(userId, payload) {
  if (!userId) return null;
  const { type = 'system', title, body = '', link = '' } = payload || {};
  if (!title) return null;
  return insStmt().run(userId, type, title, body, link).lastInsertRowid;
}

/** 批量通知（同一标题发给多人，自动去重） */
function notifyMany(userIds, payload) {
  const uniq = [...new Set((userIds || []).filter(Boolean))];
  return uniq.map((u) => notify(u, payload)).filter(Boolean);
}

module.exports = { notify, notifyMany };
