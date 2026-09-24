// 通用 CRUD 路由工厂（ScriptForge 版）。
// 与内核版的区别：读写权限分离 —— 责编（editor）可以「读全部、只写自己的」，
// 所以这里不写死 ownerColumn 判断，而是交给调用方传入 canReadRow / canWriteRow。
'use strict';
const express = require('express');
const { ok, fail, parsePage, pageResult, requireFields, toNumber } = require('./kernel').http;

/**
 * @param {object} deps
 * @param {import('better-sqlite3').Database} deps.db
 * @param {string}   deps.table        表名
 * @param {string[]} deps.fields       可写字段
 * @param {string[]} deps.required     新增必填
 * @param {string[]} deps.searchable   模糊搜索列
 * @param {string[]} deps.filterable   等值筛选列
 * @param {string}   deps.ownerColumn  归属列，默认 user_id；传 null 表示无归属
 * @param {string}   deps.orderBy      默认排序
 * @param {string[]} deps.numberFields 数字字段
 * @param {(row,user)=>boolean} deps.canReadRow
 * @param {(row,user)=>boolean} deps.canWriteRow
 * @param {(row,user)=>boolean} deps.scopeAll  返回 true 表示列表不加归属过滤
 * @param {(row:object)=>object} deps.shape
 * @param {(body:object,req:object)=>string|null} deps.validate 额外校验
 * @param {(row:object,req:object)=>void} deps.afterWrite 写后钩子
 */
function scopedCrud(deps) {
  const {
    db, table, fields, required = [], searchable = [], filterable = [],
    ownerColumn = 'user_id', orderBy = 'id DESC', numberFields = [], shape,
    canReadRow, canWriteRow, scopeAll, validate, afterWrite, derive,
  } = deps;

  const router = express.Router();
  const present = shape || ((r) => r);
  const getRow = (id) => db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);

  function buildWhere(req, { scoped }) {
    const clauses = [];
    const params = [];
    if (scoped && ownerColumn) { clauses.push(`${ownerColumn} = ?`); params.push(req.user.id); }
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

  // 列表：分页 + 搜索 + 筛选。能否看全部由 scopeAll 决定（admin/editor 为 true）。
  router.get('/', (req, res) => {
    const { page, pageSize } = parsePage(req);
    const scoped = typeof scopeAll === 'function' ? !scopeAll(null, req.user) : !!ownerColumn;
    const { where, params } = buildWhere(req, { scoped });
    const rows = db.prepare(`SELECT * FROM ${table} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
      .all(...params, pageSize, (page - 1) * pageSize);
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM ${table} ${where}`).get(...params);
    return ok(res, pageResult(rows.map(present), total, page, pageSize));
  });

  router.get('/:id', (req, res) => {
    const row = getRow(toNumber(req.params.id));
    if (!row) return fail(res, 404, '记录不存在');
    if (typeof canReadRow === 'function' && !canReadRow(row, req.user)) return fail(res, 403, '无权访问该记录');
    return ok(res, present(row));
  });

  router.post('/', (req, res) => {
    const b = { ...(req.body || {}) };
    // derive：允许调用方从已有字段推导出必填的关联字段（如 scene 的 project_id 来自 episode）。
    if (typeof derive === 'function') {
      const derived = derive(b, req);
      if (derived && derived.error) return fail(res, 400, derived.error);
      if (derived) Object.assign(b, derived);
    }
    const missing = requireFields(b, required);
    if (missing) return fail(res, 400, missing);
    if (typeof validate === 'function') {
      const err = validate(b, req);
      if (err) return fail(res, 400, err);
    }
    const cols = [];
    const vals = [];
    if (ownerColumn) { cols.push(ownerColumn); vals.push(req.user.id); }
    for (const f of fields) {
      if (b[f] !== undefined) { cols.push(f); vals.push(numberFields.includes(f) ? toNumber(b[f]) : b[f]); }
    }
    const info = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
    const row = getRow(info.lastInsertRowid);
    if (typeof afterWrite === 'function') afterWrite(row, req, 'create');
    return ok(res, present(row), '已创建', 201);
  });

  router.put('/:id', (req, res) => {
    const id = toNumber(req.params.id);
    const row = getRow(id);
    if (!row) return fail(res, 404, '记录不存在');
    if (typeof canWriteRow === 'function' && !canWriteRow(row, req.user)) return fail(res, 403, '无权修改该记录');
    const b = req.body || {};
    const cols = fields.filter((f) => b[f] !== undefined);
    if (!cols.length) return fail(res, 400, '没有可更新的字段');
    if (typeof validate === 'function') {
      const err = validate({ ...row, ...b }, req);
      if (err) return fail(res, 400, err);
    }
    const sets = cols.map((c) => `${c} = ?`).join(', ');
    db.prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`)
      .run(...cols.map((c) => (numberFields.includes(c) ? toNumber(b[c]) : b[c])), id);
    const next = getRow(id);
    if (typeof afterWrite === 'function') afterWrite(next, req, 'update');
    return ok(res, present(next), '已保存');
  });

  router.delete('/:id', (req, res) => {
    const id = toNumber(req.params.id);
    const row = getRow(id);
    if (!row) return fail(res, 404, '记录不存在');
    if (typeof canWriteRow === 'function' && !canWriteRow(row, req.user)) return fail(res, 403, '无权删除该记录');
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    return ok(res, { id }, '已删除');
  });

  return router;
}

module.exports = scopedCrud;
