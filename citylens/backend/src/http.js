// 统一响应结构：{ code, data, message }
// 成功 code=0；失败 code=HTTP 状态码。所有接口共用此约定，前端可统一解包。
'use strict';

function ok(res, data = null, message = 'ok', status = 200) {
  return res.status(status).json({ code: 0, data, message });
}

function fail(res, status, message) {
  return res.status(status).json({ code: status, data: null, message: message || '请求失败' });
}

// 分页参数：page>=1，pageSize 默认 12、上限 100。返回 offset 供 SQL LIMIT/OFFSET 使用。
function parsePage(req, defaultSize = 12) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || defaultSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

// 统一分页响应体，附带总数与页码，前端分页器直接可用。
function pageResult(rows, total, page, pageSize) {
  return { list: rows, total, page, pageSize, pages: Math.ceil(total / pageSize) || 0 };
}

// 参数校验：缺失或空白即拒绝，避免把空串写进库。
function requireFields(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || String(body[f]).trim() === '');
  return missing.length ? `缺少必填字段：${missing.join('、')}` : null;
}

// 把字符串安全转成有限数字，非法值回落默认值。
function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = { ok, fail, parsePage, pageResult, requireFields, toNumber };
