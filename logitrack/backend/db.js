// LogiTrack 数据层：12 张表 + 迁移 + 索引 + 幂等种子。
//
// 表清单：
//   users / customers / warehouses / vehicles / drivers / waybills
//   packages / route_nodes / scan_records / exceptions / notifications / status_logs
// 其中 status_logs 记录每次状态流转，是状态机可追溯性的落点。
'use strict';
require('dotenv').config();
const path = require('path');
const { openDatabase, addColumn, ensureIndexes } = require('./kernel').db;
const { hashPassword } = require('./kernel').auth;

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'logitrack.db');
const db = openDatabase(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'courier',
  nickname TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  warehouse_id INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 寄件人 / 收件人档案
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  role_type TEXT DEFAULT 'sender',
  province TEXT DEFAULT '',
  city TEXT DEFAULT '',
  district TEXT DEFAULT '',
  address TEXT DEFAULT '',
  lat REAL DEFAULT 0,
  lng REAL DEFAULT 0,
  company TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 网点（含覆盖范围）
CREATE TABLE IF NOT EXISTS warehouses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  code TEXT DEFAULT '',
  province TEXT DEFAULT '',
  city TEXT DEFAULT '',
  district TEXT DEFAULT '',
  address TEXT DEFAULT '',
  lat REAL DEFAULT 0,
  lng REAL DEFAULT 0,
  coverage TEXT DEFAULT '',
  manager TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  capacity INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 车辆档案
CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plate_no TEXT NOT NULL,
  vtype TEXT DEFAULT '厢式货车',
  load_capacity REAL DEFAULT 0,
  volume_capacity REAL DEFAULT 0,
  warehouse_id INTEGER DEFAULT 0,
  driver_id INTEGER DEFAULT 0,
  status TEXT DEFAULT 'idle',
  mileage REAL DEFAULT 0,
  next_service TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 司机档案
CREATE TABLE IF NOT EXISTS drivers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  license_no TEXT DEFAULT '',
  warehouse_id INTEGER DEFAULT 0,
  vehicle_id INTEGER DEFAULT 0,
  status TEXT DEFAULT 'available',
  rating REAL DEFAULT 5,
  completed_count INTEGER DEFAULT 0,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 运单主表
CREATE TABLE IF NOT EXISTS waybills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  waybill_no TEXT NOT NULL UNIQUE,
  sender_id INTEGER DEFAULT 0,
  receiver_id INTEGER DEFAULT 0,
  sender_name TEXT DEFAULT '',
  sender_phone TEXT DEFAULT '',
  sender_address TEXT DEFAULT '',
  sender_lat REAL DEFAULT 0,
  sender_lng REAL DEFAULT 0,
  receiver_name TEXT DEFAULT '',
  receiver_phone TEXT DEFAULT '',
  receiver_address TEXT DEFAULT '',
  receiver_lat REAL DEFAULT 0,
  receiver_lng REAL DEFAULT 0,
  origin_warehouse_id INTEGER DEFAULT 0,
  dest_warehouse_id INTEGER DEFAULT 0,
  origin_city TEXT DEFAULT '',
  dest_city TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'created',
  goods_type TEXT DEFAULT '日用品',
  weight REAL DEFAULT 0,
  volume REAL DEFAULT 0,
  insured INTEGER DEFAULT 0,
  insured_value REAL DEFAULT 0,
  freight REAL DEFAULT 0,
  payment_method TEXT DEFAULT '寄付',
  driver_id INTEGER DEFAULT 0,
  vehicle_id INTEGER DEFAULT 0,
  current_warehouse_id INTEGER DEFAULT 0,
  estimated_delivery TEXT DEFAULT '',
  actual_delivery TEXT DEFAULT '',
  signed_by TEXT DEFAULT '',
  exception_flag INTEGER DEFAULT 0,
  remark TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 包裹明细
CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  waybill_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  weight REAL DEFAULT 0,
  volume REAL DEFAULT 0,
  goods_type TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (waybill_id) REFERENCES waybills(id) ON DELETE CASCADE
);

-- 中转节点（时间轴的每一站）
CREATE TABLE IF NOT EXISTS route_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  waybill_id INTEGER NOT NULL,
  seq INTEGER DEFAULT 0,
  node_type TEXT DEFAULT 'hub',
  warehouse_id INTEGER DEFAULT 0,
  name TEXT NOT NULL,
  city TEXT DEFAULT '',
  lat REAL DEFAULT 0,
  lng REAL DEFAULT 0,
  node_status TEXT DEFAULT 'pending',
  operator TEXT DEFAULT '',
  arrived_at TEXT DEFAULT '',
  departed_at TEXT DEFAULT '',
  remark TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (waybill_id) REFERENCES waybills(id) ON DELETE CASCADE
);

-- 扫描记录
CREATE TABLE IF NOT EXISTS scan_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  waybill_id INTEGER NOT NULL,
  node_id INTEGER DEFAULT 0,
  warehouse_id INTEGER DEFAULT 0,
  scan_type TEXT DEFAULT 'inbound',
  status_snapshot TEXT DEFAULT '',
  operator TEXT DEFAULT '',
  location TEXT DEFAULT '',
  lat REAL DEFAULT 0,
  lng REAL DEFAULT 0,
  note TEXT DEFAULT '',
  scanned_at TEXT DEFAULT (datetime('now','localtime')),
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (waybill_id) REFERENCES waybills(id) ON DELETE CASCADE
);

-- 异常件
CREATE TABLE IF NOT EXISTS exceptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  waybill_id INTEGER NOT NULL,
  waybill_no TEXT DEFAULT '',
  ex_type TEXT DEFAULT '超时',
  description TEXT DEFAULT '',
  severity TEXT DEFAULT '一般',
  ex_status TEXT DEFAULT 'open',
  handler TEXT DEFAULT '',
  resolution TEXT DEFAULT '',
  source TEXT DEFAULT 'manual',
  resolved_at TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (waybill_id) REFERENCES waybills(id) ON DELETE CASCADE
);

-- 通知中心
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  waybill_id INTEGER DEFAULT 0,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  ntype TEXT DEFAULT 'system',
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 状态流转日志（状态机审计）
CREATE TABLE IF NOT EXISTS status_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  waybill_id INTEGER NOT NULL,
  from_status TEXT DEFAULT '',
  to_status TEXT NOT NULL,
  operator TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (waybill_id) REFERENCES waybills(id) ON DELETE CASCADE
);
`);

// 幂等补列：旧库升级时补齐新增字段，不破坏已有数据。
addColumn(db, 'waybills', 'exception_flag INTEGER DEFAULT 0');
addColumn(db, 'exceptions', 'source TEXT DEFAULT \'manual\'');
addColumn(db, 'exceptions', 'waybill_no TEXT DEFAULT \'\'');
addColumn(db, 'drivers', 'completed_count INTEGER DEFAULT 0');

ensureIndexes(db, `
CREATE INDEX IF NOT EXISTS idx_wb_status ON waybills(status);
CREATE INDEX IF NOT EXISTS idx_wb_no ON waybills(waybill_no);
CREATE INDEX IF NOT EXISTS idx_wb_receiver_phone ON waybills(receiver_phone);
CREATE INDEX IF NOT EXISTS idx_wb_driver ON waybills(driver_id);
CREATE INDEX IF NOT EXISTS idx_wb_created ON waybills(created_at);
CREATE INDEX IF NOT EXISTS idx_pkg_waybill ON packages(waybill_id);
CREATE INDEX IF NOT EXISTS idx_node_waybill ON route_nodes(waybill_id);
CREATE INDEX IF NOT EXISTS idx_node_seq ON route_nodes(waybill_id, seq);
CREATE INDEX IF NOT EXISTS idx_scan_waybill ON scan_records(waybill_id);
CREATE INDEX IF NOT EXISTS idx_scan_time ON scan_records(scanned_at);
CREATE INDEX IF NOT EXISTS idx_ex_status ON exceptions(ex_status);
CREATE INDEX IF NOT EXISTS idx_ex_waybill ON exceptions(waybill_id);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_log_waybill ON status_logs(waybill_id);
`);

function seedIfNeeded() {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (c > 0) return false;
  require('./seed').runSeed(db);
  return true;
}

// 模块加载即确保种子存在：测试与 server 都依赖 admin 账号，放在这里避免遗漏。
seedIfNeeded();

module.exports = { db, seedIfNeeded, DB_PATH };
