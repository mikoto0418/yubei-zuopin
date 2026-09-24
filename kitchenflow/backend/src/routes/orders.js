// 订单专属路由：下单（含明细）、状态机流转、按状态/档口筛选、结账、档口任务。
'use strict';
const express = require('express');
const { ok, fail, parsePage, pageResult, requireFields, toNumber } = require('../http');

// 状态机定义：键为当前状态，值为允许流转到的状态集合。
// 非法流转一律 400，避免前端误操作把订单推到不可能的状态。
const TRANSITIONS = {
  pending: ['accepted', 'cancelled'],
  accepted: ['cooking', 'cancelled'],
  cooking: ['ready'],
  ready: ['served'],
  served: ['paid'],
  paid: [],
  cancelled: [],
};

// 每个目标状态对应的落库时间列。
const STAMP_COLUMN = {
  accepted: 'accepted_at',
  cooking: 'cooking_at',
  ready: 'ready_at',
  served: 'served_at',
  paid: 'paid_at',
  cancelled: 'cancelled_at',
};

// 谁有权推进到哪个状态：厨师负责接单/制作/出餐，服务员负责上菜/结账，店长全权。
const ROLE_OF_TARGET = {
  accepted: ['admin', 'chef'],
  cooking: ['admin', 'chef'],
  ready: ['admin', 'chef'],
  served: ['admin', 'waiter'],
  paid: ['admin', 'waiter'],
  cancelled: ['admin', 'waiter', 'chef'],
};

module.exports = (db) => {
  const router = express.Router();

  const orderById = db.prepare('SELECT * FROM orders WHERE id = ?');
  const menuById = db.prepare('SELECT * FROM menu_items WHERE id = ?');

  // 读取订单明细（含档口任务与流转日志），用于详情与看板。
  function detail(orderId) {
    const order = orderById.get(orderId);
    if (!order) return null;
    order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(orderId);
    order.logs = db.prepare('SELECT * FROM order_status_logs WHERE order_id = ? ORDER BY id').all(orderId);
    order.tasks = db.prepare('SELECT * FROM station_tasks WHERE order_id = ? ORDER BY id').all(orderId);
    const table = order.table_id ? db.prepare('SELECT * FROM dining_tables WHERE id = ?').get(order.table_id) : null;
    order.table_no = table ? table.table_no : '';
    return order;
  }

  // 写状态流转日志（时间轴数据来源）。
  function log(orderId, from, to, user, note) {
    db.prepare('INSERT INTO order_status_logs (order_id, from_status, to_status, operator_id, operator_name, note) VALUES (?,?,?,?,?,?)')
      .run(orderId, from, to, user.id, user.nickname || user.username, note || '');
  }

  // 接单时把订单明细按菜品所属档口拆解为 station_tasks，实现「订单 → 档口」自动分发。
  function generateStationTasks(orderId) {
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
    const ins = db.prepare('INSERT INTO station_tasks (order_id, order_item_id, station_id, dish_name, quantity, status, note) VALUES (?,?,?,?,?,?,?)');
    let created = 0;
    for (const it of items) {
      if (!it.station_id) continue;
      if (db.prepare('SELECT id FROM station_tasks WHERE order_item_id = ?').get(it.id)) continue;
      ins.run(orderId, it.id, it.station_id, it.name_snapshot, it.quantity, 'pending', it.note || '');
      created += 1;
    }
    return created;
  }

  // ---------- 列表：支持 status / station / table_id / date / q 筛选 ----------
  router.get('/', (req, res) => {
    const { page, pageSize } = parsePage(req, 10);
    const clauses = [];
    const params = [];

    if (req.query.status) { clauses.push('o.status = ?'); params.push(req.query.status); }
    if (req.query.table_id) { clauses.push('o.table_id = ?'); params.push(toNumber(req.query.table_id)); }
    if (req.query.date) { clauses.push('date(o.created_at) = ?'); params.push(req.query.date); }
    // station 筛选：订单下存在属于该档口的明细。
    if (req.query.station) {
      clauses.push('EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.station_id = ?)');
      params.push(toNumber(req.query.station));
    }
    const q = (req.query.q || '').trim();
    if (q) {
      clauses.push('(o.order_no LIKE ? OR o.customer_name LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const rows = db.prepare(`
      SELECT o.*, t.table_no FROM orders o
      LEFT JOIN dining_tables t ON t.id = o.table_id
      ${where} ORDER BY o.id DESC LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page - 1) * pageSize);
    const { total } = db.prepare(`
      SELECT COUNT(*) AS total FROM orders o LEFT JOIN dining_tables t ON t.id = o.table_id ${where}
    `).get(...params);

    for (const r of rows) {
      r.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(r.id);
    }
    return ok(res, pageResult(rows, total, page, pageSize));
  });

  // ---------- 看板：按档口分列返回进行中的任务 ----------
  router.get('/board', (req, res) => {
    const stations = db.prepare('SELECT * FROM kitchen_stations ORDER BY sort_order, id').all();
    const out = stations.map((st) => {
      const tasks = db.prepare(`
        SELECT tk.*, o.order_no, o.status AS order_status, o.created_at AS order_created_at,
               t.table_no, m.prep_minutes
        FROM station_tasks tk
        JOIN orders o ON o.id = tk.order_id
        LEFT JOIN dining_tables t ON t.id = o.table_id
        LEFT JOIN menu_items m ON m.id = tk.order_item_id OR m.name = tk.dish_name
        WHERE tk.station_id = ? AND tk.status IN ('pending','cooking')
          AND o.status IN ('accepted','cooking')
        ORDER BY tk.id ASC
      `).all(st.id);
      return { station: st, tasks };
    });
    // 无档口归属的任务单列一列，避免漏单。
    const orphan = db.prepare(`
      SELECT tk.*, o.order_no, o.status AS order_status, o.created_at AS order_created_at, t.table_no
      FROM station_tasks tk JOIN orders o ON o.id = tk.order_id
      LEFT JOIN dining_tables t ON t.id = o.table_id
      WHERE (tk.station_id IS NULL OR tk.station_id = 0) AND tk.status IN ('pending','cooking')
      ORDER BY tk.id ASC
    `).all();
    if (orphan.length) out.push({ station: { id: 0, name: '未分配', color: '--gray' }, tasks: orphan });
    return ok(res, { columns: out });
  });

  // ---------- 详情 ----------
  router.get('/:id', (req, res) => {
    const d = detail(toNumber(req.params.id));
    if (!d) return fail(res, 404, '订单不存在');
    return ok(res, d);
  });

  // ---------- 下单：写订单 + 明细 + 初始日志 + 占用桌台 ----------
  router.post('/', (req, res) => {
    const b = req.body || {};
    const missing = requireFields(b, ['items']);
    if (missing) return fail(res, 400, missing);
    if (!Array.isArray(b.items) || b.items.length === 0) return fail(res, 400, '订单至少需要一个菜品');

    const table = b.table_id ? db.prepare('SELECT * FROM dining_tables WHERE id = ?').get(toNumber(b.table_id)) : null;
    if (b.table_id && !table) return fail(res, 400, '桌位不存在');

    // 先校验菜品并计算金额，避免脏数据入库。
    const resolved = [];
    for (const raw of b.items) {
      const menu = menuById.get(toNumber(raw.menu_item_id));
      if (!menu) return fail(res, 400, `菜品不存在：${raw.menu_item_id}`);
      if (!menu.available) return fail(res, 400, `菜品已下架：${menu.name}`);
      const qty = Math.max(1, toNumber(raw.quantity, 1));
      resolved.push({ menu, qty, note: raw.note || '' });
    }
    const total = +resolved.reduce((s, r) => s + r.menu.price * r.qty, 0).toFixed(2);

    const tx = db.transaction(() => {
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const { c } = db.prepare('SELECT COUNT(*) AS c FROM orders').get();
      const orderNo = `KF${day}${String(c + 1).padStart(3, '0')}`;

      const info = db.prepare(`INSERT INTO orders
        (restaurant_id, table_id, order_no, customer_name, people_count, status, total_amount, note, waiter_id)
        VALUES (1,?,?,?,?, 'pending', ?,?,?)`).run(
        table ? table.id : null, orderNo, b.customer_name || '', toNumber(b.people_count, 2),
        total, b.note || '', req.user.id
      );
      const orderId = info.lastInsertRowid;

      const insItem = db.prepare('INSERT INTO order_items (order_id, menu_item_id, name_snapshot, price, quantity, amount, note, station_id, status) VALUES (?,?,?,?,?,?,?,?,?)');
      for (const r of resolved) {
        insItem.run(orderId, r.menu.id, r.menu.name, r.menu.price, r.qty, +(r.menu.price * r.qty).toFixed(2), r.note, r.menu.station_id, 'pending');
      }
      log(orderId, '', 'pending', req.user, b.note ? `下单：${b.note}` : '下单');

      if (table) {
        db.prepare("UPDATE dining_tables SET status = 'occupied', current_order_id = ? WHERE id = ?").run(orderId, table.id);
      }
      return orderId;
    });

    const orderId = tx();
    return ok(res, detail(orderId), '下单成功', 201);
  });

  // ---------- 状态流转：后端强校验状态机与角色权限 ----------
  router.patch('/:id/status', (req, res) => {
    const id = toNumber(req.params.id);
    const order = orderById.get(id);
    if (!order) return fail(res, 404, '订单不存在');

    const target = String((req.body || {}).status || '').trim();
    if (!target) return fail(res, 400, '缺少目标状态');
    if (!Object.prototype.hasOwnProperty.call(TRANSITIONS, target)) return fail(res, 400, `未知状态：${target}`);

    const allowed = TRANSITIONS[order.status] || [];
    if (!allowed.includes(target)) {
      return fail(res, 400, `非法状态流转：${order.status} → ${target}`);
    }
    const roleOk = (ROLE_OF_TARGET[target] || []).includes(req.user.role);
    if (!roleOk) return fail(res, 403, `当前角色（${req.user.role}）无权将订单置为 ${target}`);

    const tx = db.transaction(() => {
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const col = STAMP_COLUMN[target];
      const sets = ['status = ?', `${col} = ?`];
      const params = [target, now];
      if (target === 'cancelled') {
        sets.push('cancel_reason = ?');
        params.push((req.body || {}).reason || '未填写原因');
      }
      if (['accepted', 'cooking'].includes(target)) {
        sets.push('chef_id = ?');
        params.push(req.user.id);
      }
      params.push(id);
      db.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`).run(...params);

      // 接单瞬间自动拆解档口任务（核心闭环：订单 → 档口）。
      if (target === 'accepted') generateStationTasks(id);

      // 出餐后该单所有档口任务标记完成，防止看板残留。
      if (target === 'ready') {
        db.prepare("UPDATE station_tasks SET status = 'done', finished_at = ? WHERE order_id = ? AND status != 'done'").run(now, id);
        db.prepare("UPDATE order_items SET status = 'done' WHERE order_id = ?").run(id);
      }
      if (target === 'cooking') {
        db.prepare("UPDATE order_items SET status = 'cooking' WHERE order_id = ?").run(id);
      }

      // 结账/取消释放桌台进入待清台。
      if (target === 'paid' || target === 'cancelled') {
        if (order.table_id) {
          db.prepare("UPDATE dining_tables SET status = 'cleaning', current_order_id = NULL WHERE id = ?").run(order.table_id);
        }
        if (target === 'paid') {
          const payMethod = (req.body || {}).pay_method;
          if (payMethod) db.prepare('UPDATE orders SET pay_method = ? WHERE id = ?').run(String(payMethod), id);
        }
      }
      log(id, order.status, target, req.user, (req.body || {}).note || '');
    });

    tx();
    return ok(res, detail(id), `订单已更新为 ${target}`);
  });

  // ---------- 档口任务：厨师认领 / 完成 ----------
  router.patch('/tasks/:taskId', (req, res) => {
    const taskId = toNumber(req.params.taskId);
    const task = db.prepare('SELECT * FROM station_tasks WHERE id = ?').get(taskId);
    if (!task) return fail(res, 404, '档口任务不存在');
    const status = String((req.body || {}).status || '');
    if (!['pending', 'cooking', 'done'].includes(status)) return fail(res, 400, '档口任务状态只能是 pending/cooking/done');

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const sets = ['status = ?'];
    const params = [status];
    if (status === 'cooking') { sets.push('chef_id = ?', 'started_at = ?'); params.push(req.user.id, now); }
    if (status === 'done') { sets.push('finished_at = ?'); params.push(now); }
    params.push(taskId);
    db.prepare(`UPDATE station_tasks SET ${sets.join(', ')} WHERE id = ?`).run(...params);

    // 整单所有档口任务都完成 → 订单自动进入 ready，形成「档口协作驱动订单状态」。
    const remaining = db.prepare("SELECT COUNT(*) AS c FROM station_tasks WHERE order_id = ? AND status != 'done'").get(task.order_id).c;
    let autoReady = false;
    if (remaining === 0) {
      const order = orderById.get(task.order_id);
      if (order && order.status === 'cooking') {
        db.prepare(`UPDATE orders SET status = 'ready', ready_at = ? WHERE id = ?`).run(now, order.id);
        db.prepare("UPDATE order_items SET status = 'done' WHERE order_id = ?").run(order.id);
        log(order.id, 'cooking', 'ready', req.user, '全部档口完成，自动出餐');
        autoReady = true;
      }
    }
    return ok(res, { task: db.prepare('SELECT * FROM station_tasks WHERE id = ?').get(taskId), autoReady });
  });

  return router;
};
