// 通用工具：统一错误返回 / 数值解析 / 分页解析
function fail(res, message, code = 400) {
  return res.status(code).json({ ok: false, message });
}

// 解析数值，非法/缺省时返回默认值
function num(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

// 数值边界收敛
function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// 解析分页参数：page(从1起) / pageSize，带默认值并收敛
function paging(req, defPageSize = 20, maxPageSize = 100) {
  let page = Math.floor(num(req.query.page, 1));
  let pageSize = Math.floor(num(req.query.pageSize, defPageSize));
  page = Math.max(1, page);
  pageSize = clamp(pageSize, 1, maxPageSize);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

module.exports = { fail, num, clamp, paging };