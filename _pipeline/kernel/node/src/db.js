// SQLite 连接 + 建表 + 迁移 + 索引的统一封装。
// 各系统只需传入自己的建表 SQL 与迁移/索引声明。
'use strict';
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// 打开数据库：自动创建目录、开启 WAL（并发读更稳）。
function openDatabase(dbPath) {
  const resolved = dbPath || path.join(__dirname, '..', 'data', 'app.db');
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new Database(resolved);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

// 幂等加列：旧库升级时补新增字段，不破坏已有数据。
function addColumn(db, table, colDef) {
  const name = colDef.trim().split(/\s+/)[0];
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${colDef}`);
  }
}

// 幂等建索引。
function ensureIndexes(db, sql) {
  if (sql) db.exec(sql);
}

// 分页查询助手：同时返回当页数据与总数。
function paginate(db, { sql, countSql, params = [], page = 1, pageSize = 12 }) {
  const offset = (page - 1) * pageSize;
  const list = db.prepare(`${sql} LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
  const { total } = db.prepare(countSql || `SELECT COUNT(*) AS total FROM (${sql})`).get(...params);
  return { list, total, page, pageSize, pages: Math.ceil(total / pageSize) || 0 };
}

module.exports = { openDatabase, addColumn, ensureIndexes, paginate };
