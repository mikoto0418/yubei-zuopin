// 统一响应结构：{ code, data, message }
// 成功：code=0；失败：code=HTTP 状态码（非 0），data 缺省。

function ok(res, data = null, message = 'ok', status = 200) {
  return res.status(status).json({ code: 0, data, message });
}

function fail(res, status, message) {
  return res.status(status).json({ code: status, data: null, message: message || '请求失败' });
}

// 解析分页参数：page>=1，pageSize 默认 12，上限 100
function parsePage(req, defaultSize = 12) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || defaultSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

module.exports = { ok, fail, parsePage };