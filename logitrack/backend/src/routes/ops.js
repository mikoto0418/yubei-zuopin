// 运营路由：调度台（指派司机/车辆）、通知中心、看板统计、字典。
// 调度台是 dispatcher/admin 的核心工作台：把"待分配运单"指派给司机与车辆。
'use strict';
const express = require('express');
const { ok, fail, requireFields, toNumber, parsePage, pageResult } = require('../http');
const domain = require('../domain');

// 角色守卫：调度台与看板仅 admin / dispatcher 可用。
// 通知中心与字典对所有登录角色开放（快递员也要看自己的通知）。
function roleOnly(...roles) {
  return (req, res, next) => {
    if (req.user && roles.includes(req.user.role)) return next();
    return res.status(403).json({ code: 403, data: null, message: '无权限访问调度台，需要调度员或管理员身份' });
  };
}

module.exports = (db) => {
  const router = express.Router();
  const dispatchOnly = roleOnly('admin', 'dispatcher');

  // ---------- 调度台：待分配运单池 ----------
  // 口径：未指派司机的、且尚未完结的运单
  router.get('/dispatch/pending', dispatchOnly, (req, res) => {
    const { page, pageSize } = parsePage(req, 20);
    const clauses = ["driver_id = 0", "status NOT IN ('delivered','returned')"];
    const params = [];
    if (req.query.origin_warehouse_id) { clauses.push('origin_warehouse_id = ?'); params.push(toNumber(req.query.origin_warehouse_id)); }
    if (req.query.status) { clauses.push('status = ?'); params.push(req.query.status); }
    const q = (req.query.q || '').trim();
    if (q) {
      clauses.push('(waybill_no LIKE ? OR receiver_name LIKE ? OR receiver_phone LIKE ? OR dest_city LIKE ?)');
      for (let i = 0; i < 4; i += 1) params.push(`%${q}%`);
    }
    const where = `WHERE ${clauses.join(' AND ')}`;
    const list = db.prepare(`SELECT * FROM waybills ${where} ORDER BY
      CASE status WHEN 'out_for_delivery' THEN 0 WHEN 'arrived_hub' THEN 1 WHEN 'in_transit' THEN 2 ELSE 3 END,
      estimated_delivery ASC, id DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, (page - 1) * pageSize);
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM waybills ${where}`).get(...params);
    return ok(res, pageResult(list.map(decorate), total, page, pageSize));
  });

  // ---------- 调度台：指派司机 / 车辆 ----------
  // 一个接口同时支持批量指派（dispatch_ids 数组）与单车指派。
  router.post('/dispatch/assign', dispatchOnly, (req, res) => {
    const b = req.body || {};
    const missing = requireFields(b, ['driver_id']);
    if (missing) return fail(res, 400, missing);

    const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(toNumber(b.driver_id, 0));
    if (!driver) return fail(res, 404, '司机不存在');
    if (driver.status === 'resting') return fail(res, 400, `司机「${driver.name}」正在休息，暂不能接单`);

    const ids = Array.isArray(b.waybill_ids) && b.waybill_ids.length
      ? b.waybill_ids.map((x) => toNumber(x, 0)).filter(Boolean)
      : [toNumber(b.waybill_id, 0)].filter(Boolean);
    if (!ids.length) return fail(res, 400, '缺少必填字段：waybill_id 或 waybill_ids');

    const vehicleId = toNumber(b.vehicle_id, driver.vehicle_id || 0);
    const operator = req.user.nickname || req.user.username;

    try {
      const run = db.transaction(() => {
        const done = [];
        ids.forEach((id) => {
          const wb = db.prepare('SELECT * FROM waybills WHERE id = ?').get(id);
          if (!wb) return;
          if (['delivered', 'returned'].includes(wb.status)) return; // 已完结的不再分配
          db.prepare(`UPDATE waybills SET driver_id = ?, vehicle_id = ?, current_warehouse_id = COALESCE(NULLIF(current_warehouse_id,0), origin_warehouse_id), updated_at = datetime('now','localtime') WHERE id = ?`)
            .run(driver.id, vehicleId, id);
          domain.logStatus(db, wb.user_id, id, wb.status, wb.status, operator, `指派给司机 ${driver.name}${vehicleId ? `，车辆 #${vehicleId}` : ''}`);
          domain.pushNotification(db, wb.user_id, {
            waybill_id: id,
            title: `${wb.waybill_no} 已指派`,
            body: `已指派司机 ${driver.name}（${driver.phone}）负责派送`,
            ntype: 'dispatch',
          });
          done.push({ waybill_id: id, waybill_no: wb.waybill_no });
        });

        // 司机与车辆状态同步
        if (done.length) {
          db.prepare("UPDATE drivers SET status = 'on_task' WHERE id = ?").run(driver.id);
          if (vehicleId) db.prepare("UPDATE vehicles SET status = 'in_use' WHERE id = ?").run(vehicleId);
        }
        return done;
      });
      const done = run();
      if (!done.length) return fail(res, 400, '没有可指派的运单（可能已完结或不存在）');
      return ok(res, { assigned: done.length, items: done, driver: { id: driver.id, name: driver.name } }, `已指派 ${done.length} 张运单`);
    } catch (e) {
      return fail(res, e.statusCode || 400, e.message);
    }
  });

  // 取消指派
  router.post('/dispatch/unassign', dispatchOnly, (req, res) => {
    const b = req.body || {};
    const missing = requireFields(b, ['waybill_id']);
    if (missing) return fail(res, 400, missing);
    const id = toNumber(b.waybill_id, 0);
    const wb = db.prepare('SELECT * FROM waybills WHERE id = ?').get(id);
    if (!wb) return fail(res, 404, '运单不存在');
    if (['delivered', 'returned'].includes(wb.status)) return fail(res, 400, '已完结的运单不能取消指派');
    const oldDriver = wb.driver_id ? db.prepare('SELECT name FROM drivers WHERE id = ?').get(wb.driver_id) : null;

    db.prepare("UPDATE waybills SET driver_id = 0, vehicle_id = 0, updated_at = datetime('now','localtime') WHERE id = ?").run(id);
    domain.logStatus(db, wb.user_id, id, wb.status, wb.status, req.user.nickname || req.user.username, `取消指派（原司机 ${oldDriver?.name || '无'}）`);
    return ok(res, { id }, '已取消指派');
  });

  // 调度台概况：待分配数 / 可用司机 / 可用车辆 / 各网点待派
  router.get('/dispatch/summary', dispatchOnly, (req, res) => {
    const pending = db.prepare("SELECT COUNT(*) AS c FROM waybills WHERE driver_id = 0 AND status NOT IN ('delivered','returned')").get().c;
    const active = db.prepare("SELECT COUNT(*) AS c FROM waybills WHERE driver_id != 0 AND status NOT IN ('delivered','returned')").get().c;
    const drivers = db.prepare('SELECT id, name, phone, status, rating, completed_count, warehouse_id FROM drivers ORDER BY status ASC, completed_count DESC').all();
    const vehicles = db.prepare('SELECT id, plate_no, vtype, status, load_capacity, driver_id FROM vehicles ORDER BY status ASC').all();
    const byWarehouse = db.prepare(`
      SELECT w.id, w.name, w.city, COUNT(b.id) AS pending
      FROM warehouses w
      LEFT JOIN waybills b ON b.origin_warehouse_id = w.id AND b.driver_id = 0 AND b.status NOT IN ('delivered','returned')
      GROUP BY w.id HAVING pending > 0 ORDER BY pending DESC
    `).all();
    return ok(res, {
      pending,
      active,
      available_drivers: drivers.filter((d) => d.status === 'available').length,
      available_vehicles: vehicles.filter((v) => v.status === 'idle').length,
      drivers,
      vehicles,
      by_warehouse: byWarehouse,
    });
  });

  // ---------- 通知中心 ----------
  router.get('/notifications', (req, res) => {
    const { page, pageSize } = parsePage(req, 20);
    const clauses = [];
    const params = [];
    // 默认只看自己的通知；admin 可通过 ?all=1 看全部
    if (!(req.query.all === '1' && req.user.role === 'admin')) {
      clauses.push('user_id = ?'); params.push(req.user.id);
    }
    if (req.query.ntype) { clauses.push('ntype = ?'); params.push(req.query.ntype); }
    if (req.query.unread === '1') clauses.push('is_read = 0');
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const list = db.prepare(`SELECT * FROM notifications ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, (page - 1) * pageSize);
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM notifications ${where}`).get(...params);
    const { c: unread } = db.prepare(`SELECT COUNT(*) AS c FROM notifications ${where ? `${where} AND` : 'WHERE'} is_read = 0`).get(...params);
    return ok(res, { ...pageResult(list, total, page, pageSize), unread });
  });

  router.get('/notifications/unread-count', (req, res) => {
    const { c } = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id);
    return ok(res, { unread: c });
  });

  router.patch('/notifications/:id/read', (req, res) => {
    const id = toNumber(req.params.id, 0);
    const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
    if (!row) return fail(res, 404, '通知不存在');
    if (row.user_id !== req.user.id && req.user.role !== 'admin') return fail(res, 403, '无权操作该通知');
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id);
    return ok(res, { id }, '已标记为已读');
  });

  router.post('/notifications/read-all', (req, res) => {
    const info = db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(req.user.id);
    return ok(res, { updated: info.changes }, '已全部标记为已读');
  });

  // ---------- 看板统计（admin/dispatcher） ----------
  router.get('/dashboard', dispatchOnly, (req, res) => {
    const days = Math.min(30, Math.max(3, toNumber(req.query.days, 10)));
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    const overview = require('../../overview')(db)();

    // 时效趋势（近 N 天）：每日签收量 + 平均耗时
    const trend = db.prepare(`
      SELECT substr(created_at,1,10) AS day,
             COUNT(*) AS created,
             SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) AS delivered,
             SUM(CASE WHEN status IN ('exception','returned') THEN 1 ELSE 0 END) AS abnormal
      FROM waybills WHERE substr(created_at,1,10) >= ?
      GROUP BY substr(created_at,1,10) ORDER BY day ASC
    `).all(since);

    // 异常率趋势
    const exTrend = db.prepare(`
      SELECT substr(created_at,1,10) AS day, COUNT(*) AS cnt
      FROM exceptions WHERE substr(created_at,1,10) >= ?
      GROUP BY substr(created_at,1,10) ORDER BY day ASC
    `).all(since);

    // 城市流向 TOP（用于地图/榜单）
    const routes = db.prepare(`
      SELECT origin_city || ' → ' || dest_city AS route, COUNT(*) AS cnt
      FROM waybills GROUP BY route ORDER BY cnt DESC LIMIT 8
    `).all();

    // 网点吞吐排行
    const warehouseRank = db.prepare(`
      SELECT w.id, w.name, w.city,
             COUNT(n.id) AS throughput,
             SUM(CASE WHEN n.node_type='exception' THEN 1 ELSE 0 END) AS exceptions
      FROM warehouses w LEFT JOIN route_nodes n ON n.warehouse_id = w.id
      GROUP BY w.id ORDER BY throughput DESC
    `).all();

    return ok(res, {
      overview: {
        waybills_total: overview.waybills_total,
        delivered: overview.waybills_delivered,
        in_transit: overview.waybills_in_transit,
        exception: overview.waybills_exception,
        returned: overview.waybills_returned,
        exception_rate: overview.exception_rate,
        on_time_rate: overview.on_time_rate,
        avg_delivery_hours: overview.avg_delivery_hours,
        freight_total: overview.freight_total,
      },
      trend,
      exception_trend: exTrend,
      routes,
      warehouse_rank: warehouseRank,
      status_dist: overview.status_dist,
      exception_dist: overview.exception_dist,
      driver_load: overview.driver_load,
      notifications_unread: overview.notifications_unread,
    });
  });

  // ---------- 字典：状态机 / 城市 / 货物类型 / 网点下拉 ----------
  router.get('/meta/statuses', (req, res) => ok(res, {
    statuses: domain.STATUSES.map((s) => ({
      key: s,
      label: domain.STATUS_LABEL[s],
      next: (domain.TRANSITIONS[s] || []).map((n) => ({ key: n, label: domain.STATUS_LABEL[n] })),
    })),
    transitions: domain.TRANSITIONS,
  }));

  router.get('/meta/options', (req, res) => ok(res, {
    warehouses: db.prepare('SELECT id, name, city, code FROM warehouses ORDER BY id ASC').all(),
    drivers: db.prepare('SELECT id, name, phone, status FROM drivers ORDER BY id ASC').all(),
    vehicles: db.prepare('SELECT id, plate_no, vtype, status FROM vehicles ORDER BY id ASC').all(),
    cities: db.prepare('SELECT DISTINCT city FROM warehouses ORDER BY city ASC').all().map((r) => r.city),
    goods_types: ['日用品', '服装鞋帽', '数码产品', '食品', '文件资料', '家具配件', '医药用品', '化妆品', '汽车配件', '图书'],
    payment_methods: ['寄付', '到付', '月结'],
    exception_types: ['拒收', '破损', '地址错误', '超时'],
  }));

  // 车辆/司机的当前任务（车辆司机页用）
  router.get('/fleet/tasks', (req, res) => {
    const drivers = db.prepare('SELECT * FROM drivers ORDER BY id ASC').all().map((d) => {
      const tasks = db.prepare(`
        SELECT id, waybill_no, status, receiver_name, dest_city, estimated_delivery
        FROM waybills WHERE driver_id = ? AND status NOT IN ('delivered','returned')
        ORDER BY estimated_delivery ASC
      `).all(d.id);
      const vehicle = d.vehicle_id ? db.prepare('SELECT plate_no, vtype, status FROM vehicles WHERE id = ?').get(d.vehicle_id) : null;
      const warehouse = d.warehouse_id ? db.prepare('SELECT name, city FROM warehouses WHERE id = ?').get(d.warehouse_id) : null;
      return {
        ...d,
        vehicle: vehicle || null,
        warehouse: warehouse || null,
        active_tasks: tasks.length,
        tasks,
      };
    });

    const vehicles = db.prepare('SELECT * FROM vehicles ORDER BY id ASC').all().map((v) => {
      const driver = v.driver_id ? db.prepare('SELECT id, name, phone, status FROM drivers WHERE id = ?').get(v.driver_id) : null;
      const warehouse = v.warehouse_id ? db.prepare('SELECT name, city FROM warehouses WHERE id = ?').get(v.warehouse_id) : null;
      const active = db.prepare("SELECT COUNT(*) AS c FROM waybills WHERE vehicle_id = ? AND status NOT IN ('delivered','returned')").get(v.id).c;
      return { ...v, driver: driver || null, warehouse: warehouse || null, active_tasks: active };
    });

    return ok(res, { drivers, vehicles });
  });

  return router;
};

// 列表项补展示字段（与 waybills 路由保持一致的字段名，前端可复用渲染逻辑）
function decorate(wb) {
  return {
    ...wb,
    status_label: domain.STATUS_LABEL[wb.status] || wb.status,
    progress: domain.progressOf(wb.status),
  };
}
