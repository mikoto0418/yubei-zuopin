// 通用 CRUD 路由工厂：为一张表生成 列表/详情/新增/编辑/删除 五个接口。
// 列表自带分页、关键词搜索、字段筛选，覆盖评审要求的"列表/详情/新增/编辑/删除/分页/搜索/筛选"。
'use strict';
const express = require('express');
const { ok, fail, parsePage, pageResult, requireFields, toNumber } = require('./http');

/**
 * @param {object} deps
 * @param {import('better-sqlite3').Database} deps.db
 * @param {string} deps.table            表名
 * @param {string[]} deps.fields         可写字段（新增/编辑）
 * @param {string[]} deps.required       新增时必填字段
 * @param {string[]} deps.searchable     关键词搜索命中的列
 * @param {string[]} deps.filterable     等值筛选列（如 status、category）
 * @param {string} deps.ownerColumn      归属用户列（如 user_id）；传 null 表示公共资源
 * @param {string} deps.orderBy          默认排序，默认 id DESC
 * @param {string[]} deps.numberFields   需要转数字的字段
 * @param {boolean} deps.shared         共享资源：写入时仍记录归属人，但读/改/删不做归属过滤
 *                                      （适用于城市设施这类"全员共同维护"的业务表）
 * @param {(row:object)=>object} deps.shape 行数据加工（可选，如 JSON 字段解析）
 */
function crudRoutes(deps) {
  const {
    db, table, fields, required = [], searchable = [], filterable = [],
    ownerColumn = 'user_id', orderBy = 'id DESC', numberFields = [], shared = false, shape,
  } = deps;

  const router = express.Router();
  const present = shape || ((r) => r);

  // 共享资源不做归属过滤，但 ownerColumn 仍用于写入创建人
  const scoped = ownerColumn && !shared;

  // 组装 WHERE：归属 + 筛选 + 搜索，全部走参数化，避免 SQL 注入。
  function buildWhere(req, { forOwner } = {}) {
    const clauses = [];
    const params = [];
    if (ownerColumn && forOwner) { clauses.push(`${ownerColumn} = ?`); params.push(forOwner); }
    for (const f of filterable) {
      const v = req.query[f];
      if (v !== undefined && v !== '') { clauses.push(`${f} = ?`); params.push(v); }
    }
    const q = (req.query.q || '').trim();
    if (q && searchable.length) {
      clauses.push('(' + searchable.map((c) => `${c} LIKE ?`).join(' OR ') + ')');
      searchable.forEach(() => params.push(`%${q}%`));
    }
    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
  }

  // 列表：分页 + 搜索 + 筛选。ownerColumn 存在时默认只看自己的数据，
  // 管理员可通过 ?all=1 查看全部（用于后台）。
  router.get('/', (req, res) => {
    const { page, pageSize } = parsePage(req);
    const wantAll = req.query.all === '1' && req.user && req.user.role === 'admin';
    const owner = scoped && !wantAll ? req.user.id : null;
    const { where, params } = buildWhere(req, { forOwner: owner });
    const base = `SELECT * FROM ${table} ${where} ORDER BY ${orderBy}`;
    const rows = db.prepare(`${base} LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize);
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM ${table} ${where}`).get(...params);
    return ok(res, pageResult(rows.map(present), total, page, pageSize));
  });

  // 详情
  router.get('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(toNumber(req.params.id));
    if (!row) return fail(res, 404, '记录不存在');
    if (scoped && row[ownerColumn] !== req.user.id && req.user.role !== 'admin') {
      return fail(res, 403, '无权访问该记录');
    }
    return ok(res, present(row));
  });

  // 新增
  router.post('/', (req, res) => {
    const b = req.body || {};
    const missing = requireFields(b, required);
    if (missing) return fail(res, 400, missing);
    const cols = [];
    const vals = [];
    if (ownerColumn) { cols.push(ownerColumn); vals.push(req.user.id); }
    for (const f of fields) {
      if (b[f] !== undefined) { cols.push(f); vals.push(numberFields.includes(f) ? toNumber(b[f]) : b[f]); }
    }
    const info = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid);
    return ok(res, present(row), '已创建', 201);
  });

  // 编辑
  router.put('/:id', (req, res) => {
    const id = toNumber(req.params.id);
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!row) return fail(res, 404, '记录不存在');
    if (scoped && row[ownerColumn] !== req.user.id && req.user.role !== 'admin') {
      return fail(res, 403, '无权修改该记录');
    }
    const b = req.body || {};
    const cols = fields.filter((f) => b[f] !== undefined);
    if (!cols.length) return fail(res, 400, '没有可更新的字段');
    const sets = cols.map((c) => `${c} = ?`).join(', ');
    db.prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`)
      .run(...cols.map((c) => (numberFields.includes(c) ? toNumber(b[c]) : b[c])), id);
    return ok(res, present(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id)), '已保存');
  });

  // 删除
  router.delete('/:id', (req, res) => {
    const id = toNumber(req.params.id);
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!row) return fail(res, 404, '记录不存在');
    if (scoped && row[ownerColumn] !== req.user.id && req.user.role !== 'admin') {
      return fail(res, 403, '无权删除该记录');
    }
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    return ok(res, { id }, '已删除');
  });

  return router;
}

module.exports = crudRoutes;
