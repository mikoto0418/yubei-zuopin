// 运单专属路由：创建（含包裹明细）/ 完整时间轴 / 状态流转 / 节点扫描。
// 通用 CRUD 由 crudRoutes 提供，这里只补业务语义强的接口。
'use strict';
const express = require('express');
const { ok, fail, requireFields, toNumber, parsePage, pageResult } = require('../http');
const domain = require('../domain');

module.exports = (db) => {
  const router = express.Router();

  // 查询列表：支持运单号 / 手机号 / 收件人 / 状态 / 城市 / 日期范围
  // 与通用 CRUD 不同，这里对"运单号/手机号"做精确优先匹配，符合快递查询习惯。
  router.get('/', (req, res) => {
    const { page, pageSize } = parsePage(req, 20);
    const clauses = [];
    const params = [];

    const q = (req.query.q || '').trim();
    if (q) {
      clauses.push('(waybill_no LIKE ? OR receiver_phone LIKE ? OR sender_phone LIKE ? OR receiver_name LIKE ? OR sender_name LIKE ? OR receiver_address LIKE ? OR sender_address LIKE ?)');
      for (let i = 0; i < 7; i += 1) params.push(`%${q}%`);
    }
    ['status', 'origin_city', 'dest_city', 'goods_type', 'payment_method'].forEach((f) => {
      if (req.query[f]) { clauses.push(`${f} = ?`); params.push(req.query[f]); }
    });
    if (req.query.driver_id) { clauses.push('driver_id = ?'); params.push(toNumber(req.query.driver_id)); }
    if (req.query.warehouse_id) { clauses.push('(origin_warehouse_id = ? OR dest_warehouse_id = ? OR current_warehouse_id = ?)'); const v = toNumber(req.query.warehouse_id); params.push(v, v, v); }
    if (req.query.exception === '1') clauses.push('exception_flag = 1');
    if (req.query.unassigned === '1') clauses.push('driver_id = 0');
    if (req.query.from) { clauses.push('created_at >= ?'); params.push(`${req.query.from} 00:00:00`); }
    if (req.query.to) { clauses.push('created_at <= ?'); params.push(`${req.query.to} 23:59:59`); }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    // 按下单时间倒序（而非 id）——种子数据的 id 顺序与日期顺序相反，
    // 用创建时间排序才能让首页显示"最近下的单"，符合真实物流后台的心智。
    const sql = `SELECT * FROM waybills ${where} ORDER BY created_at DESC, id DESC`;
    const list = db.prepare(`${sql} LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize);
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM waybills ${where}`).get(...params);
    return ok(res, pageResult(list.map(decorate(db)), total, page, pageSize));
  });

  // 单条运单（含包裹明细）
  router.get('/:id', (req, res) => {
    const wb = db.prepare('SELECT * FROM waybills WHERE id = ?').get(toNumber(req.params.id));
    if (!wb) return fail(res, 404, '运单不存在');
    const packages = db.prepare('SELECT * FROM packages WHERE waybill_id = ? ORDER BY id ASC').all(wb.id);
    return ok(res, { ...decorate(db)(wb), packages });
  });

  // 创建运单：寄件人 + 收件人 + 包裹信息，同时生成首节点与首条扫描记录。
  router.post('/', (req, res) => {
    const b = req.body || {};
    const missing = requireFields(b, ['sender_name', 'sender_phone', 'receiver_name', 'receiver_phone', 'receiver_address']);
    if (missing) return fail(res, 400, missing);
    if (!/^1\d{10}$/.test(String(b.sender_phone)) && !/^0\d{2,3}-?\d{7,8}$/.test(String(b.sender_phone))) {
      return fail(res, 400, '寄件人手机号格式不正确');
    }
    if (!/^1\d{10}$/.test(String(b.receiver_phone)) && !/^0\d{2,3}-?\d{7,8}$/.test(String(b.receiver_phone))) {
      return fail(res, 400, '收件人手机号格式不正确');
    }

    const create = db.transaction(() => {
      const now = new Date();
      const waybillNo = b.waybill_no && String(b.waybill_no).trim()
        ? String(b.waybill_no).trim()
        : domain.makeWaybillNo(db, now.toISOString().slice(0, 10));
      if (db.prepare('SELECT 1 FROM waybills WHERE waybill_no = ?').get(waybillNo)) {
        throw new domain.DomainError(`运单号 ${waybillNo} 已存在`, 409);
      }

      const weight = toNumber(b.weight, 0);
      const volume = toNumber(b.volume, 0);
      const insured = b.insured ? 1 : 0;
      const insuredValue = toNumber(b.insured_value, 0);
      const freight = b.freight !== undefined
        ? toNumber(b.freight, 0)
        : Number((12 + weight * 3.5 + volume * 120 + (insured ? insuredValue * 0.003 : 0)).toFixed(2));

      const originWh = toNumber(b.origin_warehouse_id, 0);
      const destWh = toNumber(b.dest_warehouse_id, 0);
      const originCity = b.origin_city || cityOfWarehouse(db, originWh);
      const destCity = b.dest_city || cityOfWarehouse(db, destWh);

      // 预计送达：基础 48 小时 + 重量/体积惩罚项（本地规则，后续可被 AI 覆盖）
      const eta = new Date(now.getTime() + (48 + Math.min(24, weight * 0.6) + Math.min(12, volume * 30)) * 3600000);
      const p = (n) => String(n).padStart(2, '0');
      const estimated = `${eta.getFullYear()}-${p(eta.getMonth() + 1)}-${p(eta.getDate())} ${p(eta.getHours())}:${p(eta.getMinutes())}:00`;

      const info = db.prepare(`INSERT INTO waybills (
        user_id, waybill_no, sender_name, sender_phone, sender_address, sender_lat, sender_lng,
        receiver_name, receiver_phone, receiver_address, receiver_lat, receiver_lng,
        origin_warehouse_id, dest_warehouse_id, origin_city, dest_city, status, goods_type,
        weight, volume, insured, insured_value, freight, payment_method,
        current_warehouse_id, estimated_delivery, remark
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        req.user.id, waybillNo,
        String(b.sender_name).trim(), String(b.sender_phone).trim(), b.sender_address || '',
        toNumber(b.sender_lat, 0), toNumber(b.sender_lng, 0),
        String(b.receiver_name).trim(), String(b.receiver_phone).trim(), String(b.receiver_address).trim(),
        toNumber(b.receiver_lat, 0), toNumber(b.receiver_lng, 0),
        originWh, destWh, originCity, destCity, 'created', b.goods_type || '日用品',
        weight, volume, insured, insuredValue, freight, b.payment_method || '寄付',
        originWh, estimated, b.remark || '',
      );
      const waybillId = info.lastInsertRowid;

      // 包裹明细
      const pkgs = Array.isArray(b.packages) ? b.packages : [];
      const insPkg = db.prepare('INSERT INTO packages (user_id, waybill_id, name, quantity, weight, volume, goods_type, note) VALUES (?,?,?,?,?,?,?,?)');
      pkgs.forEach((p2, i) => {
        const nm = String(p2.name || '').trim();
        if (!nm) return;
        insPkg.run(req.user.id, waybillId, nm, toNumber(p2.quantity, 1), toNumber(p2.weight, 0), toNumber(p2.volume, 0), p2.goods_type || b.goods_type || '', p2.note || '');
      });
      if (!pkgs.length) {
        // 未填明细时补一条汇总件，保证运单详情页不空
        insPkg.run(req.user.id, waybillId, `${b.goods_type || '日用品'}（汇总）`, 1, weight, volume, b.goods_type || '日用品', '');
      }

      // 首节点 + 首条扫描 + 流转日志 + 通知
      const wh = originWh ? db.prepare('SELECT * FROM warehouses WHERE id = ?').get(originWh) : null;
      const nodeName = `${originCity || '始发地'} · 下单`;
      const nodeId = db.prepare(`INSERT INTO route_nodes (user_id, waybill_id, seq, node_type, warehouse_id, name, city, lat, lng, node_status, operator, arrived_at, remark)
        VALUES (?,?,?,?,?,?,?,?,?,?,?, datetime('now','localtime'), ?)`)
        .run(req.user.id, waybillId, 1, 'created', originWh, nodeName, originCity, Number(wh?.lat || toNumber(b.sender_lat, 0)), Number(wh?.lng || toNumber(b.sender_lng, 0)), 'active', req.user.username || '系统', '运单创建成功').lastInsertRowid;

      db.prepare(`INSERT INTO scan_records (user_id, waybill_id, node_id, warehouse_id, scan_type, status_snapshot, operator, location, lat, lng, note)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(req.user.id, waybillId, nodeId, originWh, 'create', 'created', req.user.username || '系统', nodeName, Number(wh?.lat || 0), Number(wh?.lng || 0), '运单创建成功');

      domain.logStatus(db, req.user.id, waybillId, '', 'created', req.user.username || '系统', '运单创建成功');
      domain.pushNotification(db, req.user.id, {
        waybill_id: waybillId,
        title: `${waybillNo} 已下单`,
        body: `${b.sender_name} → ${b.receiver_name}，预计 ${estimated} 送达`,
        ntype: 'status',
      });

      return waybillId;
    });

    try {
      const id = create();
      const wb = db.prepare('SELECT * FROM waybills WHERE id = ?').get(id);
      return ok(res, decorate(db)(wb), '运单创建成功', 201);
    } catch (e) {
      return fail(res, e.statusCode || 400, e.message);
    }
  });

  // 完整节点时间轴（前端核心页数据源）
  router.get('/:id/timeline', (req, res) => {
    try {
      const id = toNumber(req.params.id);
      const wb = db.prepare('SELECT * FROM waybills WHERE id = ?').get(id);
      if (!wb) return fail(res, 404, '运单不存在');
      return ok(res, domain.buildTimeline(db, id));
    } catch (e) {
      return fail(res, e.statusCode || 500, e.message);
    }
  });

  // 状态流转：状态机校验 → 400；成功后写 scan_records + route_nodes + 通知
  router.patch('/:id/status', (req, res) => {
    const b = req.body || {};
    const missing = requireFields(b, ['status']);
    if (missing) return fail(res, 400, missing);
    const id = toNumber(req.params.id);
    const wb = db.prepare('SELECT * FROM waybills WHERE id = ?').get(id);
    if (!wb) return fail(res, 404, '运单不存在');

    // 权限：admin 全权；dispatcher 可流转非终态；courier 只能推进自己名下的运单
    const role = req.user.role;
    if (role === 'courier') {
      const mine = wb.driver_id && db.prepare('SELECT * FROM drivers WHERE id = ?').get(wb.driver_id);
      const isMine = mine && (mine.phone === req.user.phone || mine.name === req.user.nickname?.replace('快递员 · ', ''));
      if (!isMine && wb.user_id !== req.user.id) {
        return fail(res, 403, '只能操作指派给自己的运单');
      }
    }

    try {
      const updated = domain.applyTransition(db, {
        waybillId: id,
        to: String(b.status),
        operator: b.operator || req.user.nickname || req.user.username,
        note: b.note || b.remark || '',
        userId: wb.user_id,
        warehouseId: toNumber(b.warehouse_id, 0),
        location: b.location || '',
        coords: (b.lat !== undefined && b.lng !== undefined) ? { lat: toNumber(b.lat, 0), lng: toNumber(b.lng, 0) } : null,
      });
      return ok(res, decorate(db)(updated), '状态已更新');
    } catch (e) {
      return fail(res, e.statusCode || 400, e.message);
    }
  });

  // 节点扫描：在某个网点登记一次扫描，可同时推进状态。
  router.post('/:id/scan', (req, res) => {
    const b = req.body || {};
    const id = toNumber(req.params.id);
    const wb = db.prepare('SELECT * FROM waybills WHERE id = ?').get(id);
    if (!wb) return fail(res, 404, '运单不存在');

    const warehouseId = toNumber(b.warehouse_id, 0);
    const scanType = b.scan_type || 'inbound';
    const operator = b.operator || req.user.nickname || req.user.username;
    const w = warehouseId ? db.prepare('SELECT * FROM warehouses WHERE id = ?').get(warehouseId) : null;
    const location = b.location || (w ? w.name : wb.dest_city || wb.origin_city || '中转场');
    const lat = b.lat !== undefined ? toNumber(b.lat, 0) : Number(w?.lat || 0);
    const lng = b.lng !== undefined ? toNumber(b.lng, 0) : Number(w?.lng || 0);

    try {
      const run = db.transaction(() => {
        // 若指定了目标状态，先走状态机（会创建节点）；否则只在当前节点追加扫描。
        if (b.status) {
          domain.applyTransition(db, {
            waybillId: id, to: String(b.status), operator,
            note: b.note || '', userId: wb.user_id, warehouseId, location, coords: { lat, lng },
          });
        } else {
          const node = db.prepare('SELECT * FROM route_nodes WHERE waybill_id = ? ORDER BY seq DESC LIMIT 1').get(id);
          const nodeId = node ? node.id : 0;
          db.prepare(`INSERT INTO scan_records (user_id, waybill_id, node_id, warehouse_id, scan_type, status_snapshot, operator, location, lat, lng, note)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
            .run(wb.user_id, id, nodeId, warehouseId, scanType, wb.status, operator, location, lat, lng, b.note || '');
          domain.pushNotification(db, wb.user_id, {
            waybill_id: id, title: `${wb.waybill_no} 新增扫描记录`,
            body: `${location} · ${scanType}`, ntype: 'status',
          });
        }
        return db.prepare('SELECT * FROM waybills WHERE id = ?').get(id);
      });
      const updated = run();
      const timeline = domain.buildTimeline(db, id);
      return ok(res, { waybill: decorate(db)(updated), timeline }, '扫描已记录', 201);
    } catch (e) {
      return fail(res, e.statusCode || 400, e.message);
    }
  });

  // 允许的下一步状态（前端据此渲染操作按钮，避免用户点了才报 400）
  router.get('/:id/next', (req, res) => {
    const wb = db.prepare('SELECT * FROM waybills WHERE id = ?').get(toNumber(req.params.id));
    if (!wb) return fail(res, 404, '运单不存在');
    const next = domain.TRANSITIONS[wb.status] || [];
    return ok(res, {
      current: wb.status,
      current_label: domain.STATUS_LABEL[wb.status],
      next: next.map((s) => ({ status: s, label: domain.STATUS_LABEL[s] })),
    });
  });

  // 运单扫描记录（独立分页）
  router.get('/:id/scans', (req, res) => {
    const id = toNumber(req.params.id);
    const wb = db.prepare('SELECT * FROM waybills WHERE id = ?').get(id);
    if (!wb) return fail(res, 404, '运单不存在');
    const { page, pageSize } = parsePage(req, 20);
    const list = db.prepare('SELECT * FROM scan_records WHERE waybill_id = ? ORDER BY scanned_at DESC, id DESC LIMIT ? OFFSET ?')
      .all(id, pageSize, (page - 1) * pageSize);
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM scan_records WHERE waybill_id = ?').get(id);
    return ok(res, pageResult(list, total, page, pageSize));
  });

  // 删除：仅 admin。级联删掉子表（外键 ON DELETE CASCADE 已覆盖，这里显式提示）
  router.delete('/:id', (req, res) => {
    if (req.user.role !== 'admin') return fail(res, 403, '无权限，仅管理员可删除运单');
    const id = toNumber(req.params.id);
    const wb = db.prepare('SELECT * FROM waybills WHERE id = ?').get(id);
    if (!wb) return fail(res, 404, '运单不存在');
    db.prepare('DELETE FROM waybills WHERE id = ?').run(id);
    return ok(res, { id }, '运单及其明细已删除');
  });

  return router;
};

function cityOfWarehouse(db, id) {
  if (!id) return '';
  const w = db.prepare('SELECT city FROM warehouses WHERE id = ?').get(id);
  return w?.city || '';
}

// 给列表项补上展示用的派生字段，前端无需再查一次。
function decorate(db) {
  return (wb) => {
    if (!wb) return wb;
    const origin = wb.origin_warehouse_id ? db.prepare('SELECT name FROM warehouses WHERE id = ?').get(wb.origin_warehouse_id) : null;
    const dest = wb.dest_warehouse_id ? db.prepare('SELECT name FROM warehouses WHERE id = ?').get(wb.dest_warehouse_id) : null;
    const driver = wb.driver_id ? db.prepare('SELECT name, phone FROM drivers WHERE id = ?').get(wb.driver_id) : null;
    const vehicle = wb.vehicle_id ? db.prepare('SELECT plate_no FROM vehicles WHERE id = ?').get(wb.vehicle_id) : null;
    const { c: scanCount } = db.prepare('SELECT COUNT(*) AS c FROM scan_records WHERE waybill_id = ?').get(wb.id);
    return {
      ...wb,
      status_label: domain.STATUS_LABEL[wb.status] || wb.status,
      progress: domain.progressOf(wb.status),
      origin_warehouse_name: origin?.name || '',
      dest_warehouse_name: dest?.name || '',
      driver_name: driver?.name || '',
      driver_phone: driver?.phone || '',
      vehicle_plate: vehicle?.plate_no || '',
      scan_count: scanCount,
    };
  };
}
