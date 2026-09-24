// 领域层：状态机定义 + 状态流转 + 时间轴/扫描/通知的副作用。
//
// 这是本系统的业务核心，路由只做参数校验与权限判定，真正的状态约束在这里。
// 所有非法流转都会抛出带 statusCode=400 的错误，由路由统一转成 400 响应。
'use strict';

// 8 个状态：主链路 6 个 + 异常分支。
const STATUSES = [
  'created',
  'picked_up',
  'in_transit',
  'arrived_hub',
  'out_for_delivery',
  'delivered',
  'exception',
  'returned',
];

const STATUS_LABEL = {
  created: '已下单',
  picked_up: '已揽收',
  in_transit: '运输中',
  arrived_hub: '到达分拨',
  out_for_delivery: '派送中',
  delivered: '已签收',
  exception: '异常',
  returned: '已退回',
};

// 状态机迁移表：key 是当前状态，value 是允许流转到的状态数组。
// 不在表里的组合一律 400。
const TRANSITIONS = {
  created: ['picked_up', 'exception'],
  picked_up: ['in_transit', 'exception'],
  in_transit: ['arrived_hub', 'exception'],
  arrived_hub: ['out_for_delivery', 'in_transit', 'exception'],
  out_for_delivery: ['delivered', 'exception'],
  delivered: [],
  // 异常是"挂起"态：可退回，也可回到运输中继续（补发/改址后重新上路）
  exception: ['returned', 'in_transit', 'out_for_delivery'],
  returned: [],
};

// 状态对应的节点类型与默认节点名，用于自动生成时间轴节点。
const STATUS_NODE = {
  picked_up: { node_type: 'pickup', suffix: '揽收' },
  in_transit: { node_type: 'transit', suffix: '运输中' },
  arrived_hub: { node_type: 'hub', suffix: '分拨中心' },
  out_for_delivery: { node_type: 'delivery', suffix: '派送' },
  delivered: { node_type: 'signed', suffix: '签收' },
  exception: { node_type: 'exception', suffix: '异常' },
  returned: { node_type: 'returned', suffix: '退回' },
  created: { node_type: 'created', suffix: '下单' },
};

class DomainError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'DomainError';
    this.statusCode = statusCode;
  }
}

function canTransition(from, to) {
  const allowed = TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

function assertTransition(from, to) {
  if (!STATUSES.includes(to)) {
    throw new DomainError(`未知的目标状态：${to}`);
  }
  if (from === to) {
    throw new DomainError(`运单已处于「${STATUS_LABEL[from] || from}」状态，无需重复流转`);
  }
  if (!canTransition(from, to)) {
    throw new DomainError(
      `不允许的状态流转：「${STATUS_LABEL[from] || from}」→「${STATUS_LABEL[to] || to}」`,
    );
  }
}

// 生成运单号：LT + yyyymmdd + 4 位序号（按当天已有单量递增，避免撞号）
function makeWaybillNo(db, dateStr) {
  const day = String(dateStr || new Date().toISOString().slice(0, 10)).slice(0, 10).replace(/-/g, '');
  const prefix = `LT${day}`;
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM waybills WHERE waybill_no LIKE ?').get(`${prefix}%`);
  let n = Number(c) + 1;
  // 极端并发下可能撞号，循环探测直到拿到空号
  for (;;) {
    const candidate = `${prefix}${String(n).padStart(4, '0')}`;
    const exists = db.prepare('SELECT 1 FROM waybills WHERE waybill_no = ?').get(candidate);
    if (!exists) return candidate;
    n += 1;
  }
}

// 写一条通知。status 变更、异常登记都会调用。
function pushNotification(db, userId, { waybill_id = 0, title, body = '', ntype = 'status' }) {
  db.prepare(
    'INSERT INTO notifications (user_id, waybill_id, title, body, ntype) VALUES (?,?,?,?,?)',
  ).run(userId, waybill_id, title, body, ntype);
}

// 写状态流转日志（状态机审计）
function logStatus(db, userId, waybillId, from, to, operator, note = '') {
  db.prepare(
    'INSERT INTO status_logs (user_id, waybill_id, from_status, to_status, operator, note) VALUES (?,?,?,?,?,?)',
  ).run(userId, waybillId, from, to, operator || '', note);
}

// 取运单当前最大 seq，用于新增节点时排序。
function nextSeq(db, waybillId) {
  const row = db.prepare('SELECT MAX(seq) AS m FROM route_nodes WHERE waybill_id = ?').get(waybillId);
  return (row?.m || 0) + 1;
}

/**
 * 状态流转的核心实现。一个事务内完成：
 *   1) 校验状态机
 *   2) 更新 waybills.status（含各状态的伴随字段）
 *   3) 追加 status_logs
 *   4) 追加/更新 route_nodes（时间轴节点）
 *   5) 追加 scan_records（扫描记录）
 *   6) 写 notifications
 * 返回更新后的运单。
 */
function applyTransition(db, { waybillId, to, operator = '系统', note = '', userId, warehouseId = 0, location = '', coords = null }) {
  const run = db.transaction(() => {
    const wb = db.prepare('SELECT * FROM waybills WHERE id = ?').get(waybillId);
    if (!wb) throw new DomainError('运单不存在', 404);
    const from = wb.status;
    assertTransition(from, to);

    const owner = userId || wb.user_id;
    const nodeMeta = STATUS_NODE[to] || { node_type: 'hub', suffix: STATUS_LABEL[to] || to };
    const nodeName = `${warehouseId ? warehouseName(db, warehouseId) : wb.dest_city || wb.origin_city || '中转'} · ${nodeMeta.suffix}`;

    const lat = coords?.lat ?? (warehouseId ? Number(warehouseCoord(db, warehouseId).lat) : 0);
    const lng = coords?.lng ?? (warehouseId ? Number(warehouseCoord(db, warehouseId).lng) : 0);

    // 1) 主表更新：不同状态带不同的伴随字段
    const sets = ["status = ?", "updated_at = datetime('now','localtime')"];
    const vals = [to];
    if (warehouseId) { sets.push('current_warehouse_id = ?'); vals.push(warehouseId); }
    if (to === 'delivered') {
      sets.push("actual_delivery = datetime('now','localtime')");
      sets.push('exception_flag = 0');
      sets.push('signed_by = ?'); vals.push(note || wb.receiver_name || '本人');
    }
    if (to === 'exception') { sets.push('exception_flag = 1'); }
    if (to === 'returned') { sets.push('exception_flag = 0'); }
    if (to === 'in_transit' && from === 'exception') { sets.push('exception_flag = 0'); }
    db.prepare(`UPDATE waybills SET ${sets.join(', ')} WHERE id = ?`).run(...vals, waybillId);

    // 2) 流转日志
    logStatus(db, owner, waybillId, from, to, operator, note);

    // 3) 时间轴节点：该运单在此状态上的节点
    const seq = nextSeq(db, waybillId);
    const nodeStatus = to === 'delivered' || to === 'returned' ? 'done'
      : to === 'exception' ? 'exception' : 'active';
    const nodeInfo = db.prepare(`
      INSERT INTO route_nodes (user_id, waybill_id, seq, node_type, warehouse_id, name, city, lat, lng, node_status, operator, arrived_at, remark)
      VALUES (?,?,?,?,?,?,?,?,?,?,?, datetime('now','localtime'), ?)
    `).run(
      owner, waybillId, seq, nodeMeta.node_type, warehouseId || 0, nodeName,
      wb.dest_city || wb.origin_city || '', lat, lng, nodeStatus, operator, note,
    );
    const nodeId = nodeInfo.lastInsertRowid;

    // 上一个节点标记为已离开（节点间是"进行中 → 完成"的推进关系）
    db.prepare(
      "UPDATE route_nodes SET node_status = 'done', departed_at = datetime('now','localtime') WHERE waybill_id = ? AND id != ? AND node_status = 'active'",
    ).run(waybillId, nodeId);

    // 4) 扫描记录
    db.prepare(`
      INSERT INTO scan_records (user_id, waybill_id, node_id, warehouse_id, scan_type, status_snapshot, operator, location, lat, lng, note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(owner, waybillId, nodeId, warehouseId || 0, scanTypeOf(to), to, operator, location || nodeName, lat, lng, note);

    // 5) 通知
    const title = `${wb.waybill_no} ${STATUS_LABEL[to] || to}`;
    pushNotification(db, owner, { waybill_id: waybillId, title, body: note || nodeName, ntype: to === 'exception' ? 'alert' : 'status' });

    // 6) 司机完单计数
    if (to === 'delivered' && wb.driver_id) {
      db.prepare('UPDATE drivers SET completed_count = completed_count + 1 WHERE id = ?').run(wb.driver_id);
      db.prepare("UPDATE drivers SET status = 'available' WHERE id = ?").run(wb.driver_id);
      if (wb.vehicle_id) db.prepare("UPDATE vehicles SET status = 'idle' WHERE id = ?").run(wb.vehicle_id);
    }

    return db.prepare('SELECT * FROM waybills WHERE id = ?').get(waybillId);
  });
  return run();
}

function scanTypeOf(to) {
  return {
    picked_up: 'pickup',
    in_transit: 'transit',
    arrived_hub: 'inbound',
    out_for_delivery: 'outbound',
    delivered: 'signed',
    exception: 'exception',
    returned: 'return',
    created: 'create',
  }[to] || 'inbound';
}

function warehouseName(db, id) {
  const w = db.prepare('SELECT name FROM warehouses WHERE id = ?').get(id);
  return w?.name || '中转场';
}

function warehouseCoord(db, id) {
  const w = db.prepare('SELECT lat, lng FROM warehouses WHERE id = ?').get(id);
  return { lat: Number(w?.lat || 0), lng: Number(w?.lng || 0) };
}

/**
 * 运单完整时间轴：把 route_nodes / scan_records / status_logs 三条线合并成
 * 前端可直接渲染的节点数组（按时间升序），并附带地图坐标。
 */
function buildTimeline(db, waybillId) {
  const wb = db.prepare('SELECT * FROM waybills WHERE id = ?').get(waybillId);
  if (!wb) throw new DomainError('运单不存在', 404);

  const nodes = db.prepare('SELECT * FROM route_nodes WHERE waybill_id = ? ORDER BY seq ASC, id ASC').all(waybillId);
  const scans = db.prepare('SELECT * FROM scan_records WHERE waybill_id = ? ORDER BY scanned_at ASC, id ASC').all(waybillId);
  const logs = db.prepare('SELECT * FROM status_logs WHERE waybill_id = ? ORDER BY id ASC').all(waybillId);
  const pkgs = db.prepare('SELECT * FROM packages WHERE waybill_id = ? ORDER BY id ASC').all(waybillId);

  const scansByNode = new Map();
  scans.forEach((s) => {
    if (!scansByNode.has(s.node_id)) scansByNode.set(s.node_id, []);
    scansByNode.get(s.node_id).push(s);
  });

  const points = nodes.map((n) => ({
    id: n.id,
    seq: n.seq,
    node_type: n.node_type,
    name: n.name,
    city: n.city,
    warehouse_id: n.warehouse_id,
    lat: Number(n.lat) || 0,
    lng: Number(n.lng) || 0,
    node_status: n.node_status,
    operator: n.operator,
    arrived_at: n.arrived_at,
    departed_at: n.departed_at,
    remark: n.remark,
    status: statusOfNodeType(n.node_type),
    scans: scansByNode.get(n.id) || [],
  }));

  // 起点（寄件地）与终点（收件地）也作为地图锚点，保证地图上一定有起终点。
  // 收寄件人没填经纬度时回落到所属网点的坐标——地图联动不能因为缺坐标而失去锚点。
  const originWh = wb.origin_warehouse_id ? warehouseCoord(db, wb.origin_warehouse_id) : { lat: 0, lng: 0 };
  const destWh = wb.dest_warehouse_id ? warehouseCoord(db, wb.dest_warehouse_id) : { lat: 0, lng: 0 };
  const originLat = Number(wb.sender_lat) || originWh.lat;
  const originLng = Number(wb.sender_lng) || originWh.lng;
  const destLat = Number(wb.receiver_lat) || destWh.lat;
  const destLng = Number(wb.receiver_lng) || destWh.lng;

  const anchors = [];
  if (originLat && originLng) {
    anchors.push({
      id: 'origin', seq: 0, node_type: 'origin', name: `寄件地 · ${wb.origin_city || ''}`.trim(),
      city: wb.origin_city, lat: originLat, lng: originLng,
      node_status: 'done', status: 'created', address: wb.sender_address,
      operator: wb.sender_name, arrived_at: wb.created_at, departed_at: '', remark: '', scans: [],
    });
  }
  if (destLat && destLng) {
    const done = wb.status === 'delivered';
    anchors.push({
      id: 'dest', seq: 9999, node_type: 'destination', name: `收件地 · ${wb.dest_city || ''}`.trim(),
      city: wb.dest_city, lat: destLat, lng: destLng,
      node_status: done ? 'done' : 'pending',
      // 收件地还没有对应状态（货没到），用 'pending' 占位；
      // 前端 statusMeta 会把它渲染成"待收货"而不是原始英文键。
      status: done ? 'delivered' : 'pending',
      address: wb.receiver_address, operator: wb.receiver_name,
      arrived_at: done ? wb.actual_delivery : '', departed_at: '', remark: '', scans: [],
    });
  }

  const all = [...anchors.filter((a) => a.id === 'origin'), ...points, ...anchors.filter((a) => a.id === 'dest')];

  return {
    // 详情页直接消费这里的 waybill，因此在这里补上展示用的派生字段，
    // 前端不必再为「发出网点名 / 司机名 / 车牌」多发一次请求。
    waybill: withDisplayFields(db, wb),
    packages: pkgs,
    nodes: all,
    scans,
    logs,
    summary: {
      total_nodes: all.length,
      scanned: scans.length,
      exceptions: logs.filter((l) => l.to_status === 'exception').length,
      duration_hours: durationHours(wb.created_at, wb.actual_delivery || null),
      progress: progressOf(wb.status),
    },
  };
}

// 给运单补上关联名称（网点 / 司机 / 车牌），避免前端为展示多发请求。
function withDisplayFields(db, wb) {
  const origin = wb.origin_warehouse_id ? db.prepare('SELECT name FROM warehouses WHERE id = ?').get(wb.origin_warehouse_id) : null;
  const dest = wb.dest_warehouse_id ? db.prepare('SELECT name FROM warehouses WHERE id = ?').get(wb.dest_warehouse_id) : null;
  const driver = wb.driver_id ? db.prepare('SELECT name, phone FROM drivers WHERE id = ?').get(wb.driver_id) : null;
  const vehicle = wb.vehicle_id ? db.prepare('SELECT plate_no FROM vehicles WHERE id = ?').get(wb.vehicle_id) : null;
  return {
    ...wb,
    status_label: STATUS_LABEL[wb.status] || wb.status,
    origin_warehouse_name: origin?.name || '',
    dest_warehouse_name: dest?.name || '',
    driver_name: driver?.name || '',
    driver_phone: driver?.phone || '',
    vehicle_plate: vehicle?.plate_no || '',
  };
}

function statusOfNodeType(t) {
  return {
    created: 'created',
    pickup: 'picked_up',
    transit: 'in_transit',
    hub: 'arrived_hub',
    delivery: 'out_for_delivery',
    signed: 'delivered',
    exception: 'exception',
    returned: 'returned',
  }[t] || 'in_transit';
}

function progressOf(status) {
  const order = ['created', 'picked_up', 'in_transit', 'arrived_hub', 'out_for_delivery', 'delivered'];
  if (status === 'exception') return 0.5;
  if (status === 'returned') return 1;
  const i = order.indexOf(status);
  return i < 0 ? 0 : Number(((i + 1) / order.length).toFixed(3));
}

function durationHours(from, to) {
  if (!from) return 0;
  const a = new Date(String(from).replace(' ', 'T'));
  const b = to ? new Date(String(to).replace(' ', 'T')) : new Date();
  const h = (b - a) / 3600000;
  return Number.isFinite(h) && h > 0 ? Number(h.toFixed(1)) : 0;
}

module.exports = {
  STATUSES,
  STATUS_LABEL,
  TRANSITIONS,
  DomainError,
  canTransition,
  assertTransition,
  makeWaybillNo,
  pushNotification,
  logStatus,
  nextSeq,
  applyTransition,
  buildTimeline,
  progressOf,
  durationHours,
  scanTypeOf,
  warehouseName,
  warehouseCoord,
  statusOfNodeType,
};
