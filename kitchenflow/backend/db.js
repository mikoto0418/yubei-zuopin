// KitchenFlow 数据层：11 张表 + 索引 + 幂等种子（跨 7 天、每张主表 ≥15 条）。
'use strict';
require('dotenv').config();
const path = require('path');
const { openDatabase, ensureIndexes } = require('./kernel').db;
const { hashPassword } = require('./kernel').auth;

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'kitchenflow.db');
const db = openDatabase(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'waiter',
  nickname TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  restaurant_id INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS restaurants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  owner_id INTEGER,
  open_time TEXT DEFAULT '10:00',
  close_time TEXT DEFAULT '22:00',
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS dining_tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL DEFAULT 1,
  table_no TEXT NOT NULL,
  seats INTEGER DEFAULT 4,
  zone TEXT DEFAULT '大厅',
  status TEXT NOT NULL DEFAULT 'idle',
  current_order_id INTEGER,
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS menu_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS kitchen_stations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  code TEXT DEFAULT '',
  color TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL DEFAULT 1,
  category_id INTEGER NOT NULL,
  station_id INTEGER,
  name TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  image_url TEXT DEFAULT '',
  description TEXT DEFAULT '',
  cooking_method TEXT DEFAULT '',
  prep_minutes INTEGER DEFAULT 15,
  available INTEGER DEFAULT 1,
  predicted_demand INTEGER DEFAULT 0,
  sales_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE CASCADE,
  FOREIGN KEY (station_id) REFERENCES kitchen_stations(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL DEFAULT 1,
  table_id INTEGER,
  order_no TEXT NOT NULL,
  customer_name TEXT DEFAULT '',
  people_count INTEGER DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'pending',
  total_amount REAL DEFAULT 0,
  note TEXT DEFAULT '',
  waiter_id INTEGER,
  chef_id INTEGER,
  pay_method TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  accepted_at TEXT,
  cooking_at TEXT,
  ready_at TEXT,
  served_at TEXT,
  paid_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT DEFAULT '',
  FOREIGN KEY (table_id) REFERENCES dining_tables(id) ON DELETE SET NULL,
  FOREIGN KEY (waiter_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  menu_item_id INTEGER,
  name_snapshot TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  amount REAL NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  station_id INTEGER,
  status TEXT DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS order_status_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  from_status TEXT DEFAULT '',
  to_status TEXT NOT NULL,
  operator_id INTEGER,
  operator_name TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS station_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  order_item_id INTEGER,
  station_id INTEGER NOT NULL,
  dish_name TEXT DEFAULT '',
  quantity INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  chef_id INTEGER,
  note TEXT DEFAULT '',
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (station_id) REFERENCES kitchen_stations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staff_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER NOT NULL,
  shift_date TEXT NOT NULL,
  start_time TEXT DEFAULT '10:00',
  end_time TEXT DEFAULT '18:00',
  role TEXT DEFAULT 'waiter',
  status TEXT DEFAULT 'scheduled',
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

ensureIndexes(db, `
CREATE INDEX IF NOT EXISTS idx_tables_status ON dining_tables(status);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_station ON menu_items(station_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_logs_order ON order_status_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_tasks_order ON station_tasks(order_id);
CREATE INDEX IF NOT EXISTS idx_tasks_station ON station_tasks(station_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON station_tasks(status);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON staff_shifts(shift_date);
`);

// ---------- 种子 ----------
// 菜单静态定义：[名称, 分类序号(1-5), 价格, 档口序号(1-4), 预计分钟, 做法, 描述]
const MENU = [
  ['宫保鸡丁', 1, 38, 1, 12, '爆炒', '花生米配鸡丁，微辣回甜'],
  ['鱼香肉丝', 1, 32, 1, 10, '爆炒', '泡椒木耳笋丝，酸甜微辣'],
  ['麻婆豆腐', 1, 26, 1, 8, '烧制', '嫩豆腐配牛肉末，麻辣鲜香'],
  ['红烧肉', 1, 48, 1, 25, '慢炖', '五花肉慢炖两小时，入口即化'],
  ['水煮牛肉', 1, 58, 1, 15, '汆煮', '现片牛肉，滚油泼辣椒'],
  ['干煸四季豆', 1, 24, 1, 9, '干煸', '肉末芽菜同煸，干香下饭'],
  ['辣子鸡', 1, 45, 1, 14, '油炸', '鸡块炸透后与干辣椒同炒'],
  ['番茄炒蛋', 1, 22, 1, 6, '快炒', '沙瓤番茄，蛋嫩汁浓'],

  ['拍黄瓜', 2, 12, 2, 3, '凉拌', '蒜香醋香，清脆爽口'],
  ['口水鸡', 2, 28, 2, 6, '凉拌', '土鸡放凉，红油浸润'],
  ['凉拌木耳', 2, 16, 2, 4, '凉拌', '东北秋木耳，酸辣开胃'],
  ['夫妻肺片', 2, 36, 2, 7, '凉拌', '牛腱牛肚拼盘，麻辣鲜香'],
  ['皮蛋豆腐', 2, 14, 2, 3, '凉拌', '内酯豆腐配溏心皮蛋'],

  ['蛋炒饭', 3, 18, 3, 7, '翻炒', '隔夜米粒粒分明'],
  ['阳春面', 3, 14, 3, 6, '煮制', '猪油葱花，清汤细面'],
  ['担担面', 3, 20, 3, 8, '煮制', '芝麻酱花椒面，微辣带香'],
  ['米饭', 3, 3, 3, 1, '蒸制', '东北珍珠米'],
  ['手工水饺', 4, 26, 3, 12, '煮制', '猪肉白菜，现包现煮'],

  ['鲜榨橙汁', 4, 16, 4, 4, '鲜榨', '当日鲜橙现榨'],
  ['柠檬水', 4, 10, 4, 2, '调制', '鲜柠檬片冰镇'],
  ['冰镇酸梅汤', 4, 12, 4, 2, '调制', '乌梅山楂熬制，冰镇'],
  ['可乐', 4, 6, 4, 1, '瓶装', '冰镇听装'],
  ['珍珠奶茶', 4, 18, 4, 5, '调制', '黑糖珍珠，鲜奶打底'],

  ['西红柿蛋汤', 5, 16, 1, 6, '煮制', '番茄浓汤，蛋花细腻'],
  ['紫菜蛋花汤', 5, 14, 1, 5, '煮制', '头水紫菜，清淡解腻'],
];

// 订单状态池：过去 6 天以已完成为主，今天保留进行中的单。
const PAST_POOL = ['paid', 'paid', 'paid', 'paid', 'served', 'cancelled'];
const TODAY_POOL = ['pending', 'accepted', 'cooking', 'ready'];

function seedIfNeeded() {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (c > 0) return;

  // 确定性伪随机，保证每次重建种子数据一致。
  let seed = 20240924;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const pad = (n) => String(n).padStart(2, '0');
  const dayStr = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const tx = db.transaction(() => {
    // 1) 用户（3 个演示账号）
    const insUser = db.prepare('INSERT INTO users (username,password,role,nickname,avatar,phone,restaurant_id) VALUES (?,?,?,?,?,?,?)');
    const adminId = insUser.run('admin', hashPassword('admin123'), 'admin', '张店长', '', '13800000001', 1).lastInsertRowid;
    const waiterId = insUser.run('waiter1', hashPassword('waiter123'), 'waiter', '小李小王', '', '13800000002', 1).lastInsertRowid;
    const chefId = insUser.run('chef1', hashPassword('chef123'), 'chef', '陈师傅', '', '13800000003', 1).lastInsertRowid;

    // 2) 餐厅
    db.prepare('INSERT INTO restaurants (name,address,phone,owner_id,open_time,close_time,description) VALUES (?,?,?,?,?,?,?)')
      .run('味见小馆', '杭州市西湖区文三路 128 号', '0571-88886666', adminId, '10:00', '22:00', '主营川湘家常菜，共 12 桌，四个出品档口。');

    // 3) 档口（4 个）
    const insStation = db.prepare('INSERT INTO kitchen_stations (restaurant_id,name,code,color,sort_order,description) VALUES (1,?,?,?,?,?)');
    const stationIds = [
      insStation.run('热菜档', 'HOT', '--orange', 1, '炒锅 / 炖锅，负责全部热菜与汤羹').lastInsertRowid,
      insStation.run('凉菜档', 'COLD', '--green', 2, '冷盘凉拌，出餐最快').lastInsertRowid,
      insStation.run('主食档', 'STAPLE', '--yellow', 3, '米饭面点水饺').lastInsertRowid,
      insStation.run('饮品档', 'DRINK', '--blue', 4, '现榨饮品与瓶装饮料').lastInsertRowid,
    ];

    // 4) 分类（5 个）
    const insCat = db.prepare('INSERT INTO menu_categories (restaurant_id,name,sort_order,description) VALUES (1,?,?,?)');
    const catIds = ['热菜', '凉菜', '主食', '饮品', '汤羹'].map((n, i) =>
      insCat.run(n, i + 1, `${n}类目`).lastInsertRowid);

    // 5) 菜品（25 个，挂到 4 个档口）
    const insItem = db.prepare('INSERT INTO menu_items (restaurant_id,category_id,station_id,name,price,image_url,description,cooking_method,prep_minutes,available,sales_count) VALUES (1,?,?,?,?,?,?,?,?,1,?)');
    const itemIds = MENU.map((m, i) => {
      const [name, cat, price, st, mins, method, desc] = m;
      const img = `https://picsum.photos/seed/kf${i + 1}/480/320`;
      return insItem.run(catIds[cat - 1], stationIds[st - 1], name, price, img, desc, method, mins, Math.floor(rnd() * 120) + 10).lastInsertRowid;
    });
    // 菜单项与菜品一一对应（下标一致），便于下单时取档口。
    const menuRows = itemIds.map((id) => db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id));

    // 6) 桌台（12 张）
    const insTable = db.prepare('INSERT INTO dining_tables (restaurant_id,table_no,seats,zone,status,note) VALUES (1,?,?,?,?,?)');
    const tableIds = [];
    for (let i = 1; i <= 12; i++) {
      const zone = i <= 6 ? '大厅' : i <= 9 ? '靠窗' : '包间';
      const seats = i <= 6 ? 4 : i <= 9 ? 2 : 8;
      tableIds.push(insTable.run(`A${pad(i)}`, seats, zone, 'idle', '').lastInsertRowid);
    }

    // 7) 订单（40 单，跨 7 个日期：-6 ~ 0）
    const insOrder = db.prepare(`INSERT INTO orders
      (restaurant_id,table_id,order_no,customer_name,people_count,status,total_amount,note,waiter_id,chef_id,pay_method,
       created_at,accepted_at,cooking_at,ready_at,served_at,paid_at,cancelled_at,cancel_reason)
      VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insOrderItem = db.prepare('INSERT INTO order_items (order_id,menu_item_id,name_snapshot,price,quantity,amount,note,station_id,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
    const insLog = db.prepare('INSERT INTO order_status_logs (order_id,from_status,to_status,operator_id,operator_name,note,created_at) VALUES (?,?,?,?,?,?,?)');
    const insTask = db.prepare('INSERT INTO station_tasks (order_id,order_item_id,station_id,dish_name,quantity,status,chef_id,note,started_at,finished_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');

    const at = (day, h, m) => `${day} ${pad(h)}:${pad(m)}:00`;
    const chain = ['pending', 'accepted', 'cooking', 'ready', 'served', 'paid'];
    const notes = ['', '少辣', '免葱', '不要香菜', '米饭多加一份', '打包', '小孩吃，不辣'];
    const names = ['王先生', '李女士', '陈同学', '刘女士', '赵先生', '孙女士', '周先生', '吴女士'];
    let orderSeq = 0;

    for (let d = -6; d <= 0; d++) {
      const day = dayStr(d);
      const count = d === 0 ? TODAY_POOL.length : 6;
      for (let k = 0; k < count; k++) {
        orderSeq += 1;
        const status = d === 0 ? TODAY_POOL[k] : pick(PAST_POOL);
        const tableId = tableIds[Math.floor(rnd() * tableIds.length)];
        const hour = d === 0 ? 11 + k : 11 + Math.floor(rnd() * 9);
        const minute = Math.floor(rnd() * 60);
        const created = at(day, hour, minute);

        // 先插入订单占位，拿到 id 后再写明细与总额。
        const info = insOrder.run(
          tableId, `KF${day.replace(/-/g, '')}${pad(orderSeq)}`, pick(names),
          1 + Math.floor(rnd() * 4), status, 0, pick(notes),
          waiterId, status === 'pending' ? null : chefId,
          ['paid'].includes(status) ? pick(['微信', '支付宝', '现金', '刷卡']) : '',
          created, null, null, null, null, null, null, ''
        );
        const orderId = info.lastInsertRowid;

        // 明细：2-4 个菜品
        const n = 2 + Math.floor(rnd() * 3);
        const chosen = [];
        while (chosen.length < n) {
          const it = menuRows[Math.floor(rnd() * menuRows.length)];
          if (!chosen.some((c) => c.id === it.id)) chosen.push(it);
        }
        let total = 0;
        const createdItems = [];
        for (const it of chosen) {
          const qty = 1 + Math.floor(rnd() * 2);
          const amount = +(it.price * qty).toFixed(2);
          total += amount;
          const itemStatus = ['ready', 'served', 'paid'].includes(status) ? 'done'
            : status === 'cooking' ? (rnd() > 0.5 ? 'cooking' : 'done')
              : status === 'accepted' ? 'pending' : 'pending';
          const itemInfo = insOrderItem.run(
            orderId, it.id, it.name, it.price, qty, amount,
            rnd() > 0.7 ? pick(['少辣', '免葱', '多放醋']) : '',
            it.station_id, itemStatus, created
          );
          createdItems.push({ id: itemInfo.lastInsertRowid, item: it, qty, note: '', status: itemStatus });
        }
        db.prepare('UPDATE orders SET total_amount = ? WHERE id = ?').run(+total.toFixed(2), orderId);

        // 状态流转日志 + 档口任务：按状态链推进时间戳。
        let idx = chain.indexOf(status);
        const cancelled = status === 'cancelled';
        if (cancelled) idx = 1; // 取消发生在接单前后

        const times = {
          accepted: at(day, hour, Math.min(59, minute + 1)),
          cooking: at(day, hour, Math.min(59, minute + 3)),
          ready: at(day, hour, Math.min(59, minute + 8)),
          served: at(day, hour, Math.min(59, minute + 12)),
          paid: at(day, hour, Math.min(59, minute + 40)),
        };
        insLog.run(orderId, '', 'pending', waiterId, '小李小王', '服务员下单', created);
        const walk = cancelled ? ['accepted'] : chain.slice(1, idx + 1);
        let prev = 'pending';
        for (const st of walk) {
          const op = ['cooking', 'ready'].includes(st) ? chefId : waiterId;
          const opName = ['cooking', 'ready'].includes(st) ? '陈师傅' : '小李小王';
          insLog.run(orderId, prev, st, op, opName, '', times[st]);
          prev = st;
        }
        if (cancelled) {
          insLog.run(orderId, 'accepted', 'cancelled', waiterId, '小李小王', '客人临时有事', times.served);
          db.prepare('UPDATE orders SET cancelled_at = ?, cancel_reason = ? WHERE id = ?')
            .run(times.served, '客人临时有事', orderId);
        } else {
          for (const st of walk) {
            const col = st === 'served' ? 'served_at' : `${st}_at`;
            db.prepare(`UPDATE orders SET ${col} = ? WHERE id = ?`).run(times[st], orderId);
          }
        }

        // 档口任务：接单之后才拆解（pending 与 cancelled-未接单 不产生任务）
        if (status !== 'pending') {
          for (const ci of createdItems) {
            const taskStatus = ci.status === 'done' ? 'done' : ci.status === 'cooking' ? 'cooking' : 'pending';
            insTask.run(
              orderId, ci.id, ci.item.station_id, ci.item.name, ci.qty, taskStatus,
              taskStatus === 'pending' ? null : chefId, ci.note,
              taskStatus === 'pending' ? null : times.cooking,
              taskStatus === 'done' ? times.ready : null,
              created
            );
          }
        }
      }
    }

    // 8) 班次（3 人 × 7 天 = 21 条）
    const insShift = db.prepare('INSERT INTO staff_shifts (restaurant_id,user_id,shift_date,start_time,end_time,role,status,note) VALUES (1,?,?,?,?,?,?,?)');
    const staff = [
      [waiterId, 'waiter', '10:00', '18:00'],
      [chefId, 'chef', '10:30', '21:00'],
      [adminId, 'admin', '09:30', '19:00'],
    ];
    for (let d = -6; d <= 0; d++) {
      const day = dayStr(d);
      for (const [uid, role, s, e] of staff) {
        insShift.run(uid, day, s, e, role, day === dayStr(0) ? 'active' : 'done', '');
      }
    }

    // 9) 桌台占用态：把今天进行中的订单挂到桌上。
    const busy = db.prepare("SELECT id, table_id FROM orders WHERE status IN ('pending','accepted','cooking','ready','served')").all();
    const setBusy = db.prepare("UPDATE dining_tables SET status = 'occupied', current_order_id = ? WHERE id = ?");
    for (const o of busy) if (o.table_id) setBusy.run(o.id, o.table_id);
    db.prepare("UPDATE dining_tables SET status = 'cleaning' WHERE id IN (SELECT id FROM dining_tables WHERE status = 'idle' ORDER BY id LIMIT 2)").run();
  });

  tx();
  console.log('[seed] KitchenFlow 种子数据已写入');
}

module.exports = { db, seedIfNeeded };
