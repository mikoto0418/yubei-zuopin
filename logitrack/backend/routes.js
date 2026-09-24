// 抽出挂载函数，使 server.js 与测试共用同一套路由装配。
'use strict';
const { authRoutes, adminRoutes, crudRoutes, requireAuth } = require('./kernel');
const { db } = require('./db');

// 角色守卫：仅指定角色可访问。挂在 requireAuth 之后使用。
function roleOnly(...roles) {
  return (req, res, next) => {
    if (req.user && roles.includes(req.user.role)) return next();
    return res.status(403).json({ code: 403, data: null, message: '无权限访问该功能' });
  };
}

function mountRoutes(app, api) {
  // ---------- 认证 ----------
  app.use(`${api}/auth`, authRoutes({ db, extraColumns: ['phone', 'warehouse_id'] }));

  // ---------- Admin ----------
  app.use(`${api}/admin`, adminRoutes({ db, buildOverview: require('./overview')(db) }));

  // ---------- 运单（专属路由：创建 / 时间轴 / 状态机 / 扫描） ----------
  app.use(`${api}/waybills`, requireAuth, require('./src/routes/waybills')(db));

  // ---------- 异常件 ----------
  app.use(`${api}/exceptions`, requireAuth, require('./src/routes/exceptions')(db));

  // ---------- AI 三接口 ----------
  app.use(`${api}/ai`, requireAuth, require('./src/routes/ai')(db));

  // ---------- 运营：调度 / 通知 / 看板 / 字典 ----------
  // 整个 ops 路由挂在 /ops 下；其中调度与看板在 ops.js 内部用 roleOnly 限权，
  // 通知与字典对所有登录角色开放。
  app.use(`${api}/ops`, requireAuth, require('./src/routes/ops')(db));

  // ---------- 通用 CRUD 实体 ----------
  // 网点：调度台维护，admin/dispatcher 可写；查询对所有登录用户开放。
  app.use(`${api}/entities/warehouses`, requireAuth, crudRoutes({
    db, table: 'warehouses',
    fields: ['name', 'code', 'province', 'city', 'district', 'address', 'lat', 'lng', 'coverage', 'manager', 'phone', 'capacity', 'status'],
    required: ['name'],
    searchable: ['name', 'code', 'city', 'address', 'coverage', 'manager'],
    filterable: ['city', 'status', 'province'],
    ownerColumn: null, // 网点是共享资源
    sharedColumn: 'user_id',
    orderBy: 'id ASC',
    numberFields: ['lat', 'lng', 'capacity'],
    writeRoles: ['admin', 'dispatcher'],
  }));

  // 车辆
  app.use(`${api}/entities/vehicles`, requireAuth, crudRoutes({
    db, table: 'vehicles',
    fields: ['plate_no', 'vtype', 'load_capacity', 'volume_capacity', 'warehouse_id', 'driver_id', 'status', 'mileage', 'next_service', 'note'],
    required: ['plate_no'],
    searchable: ['plate_no', 'vtype', 'note'],
    filterable: ['status', 'vtype', 'warehouse_id'],
    ownerColumn: null,
    sharedColumn: 'user_id',
    orderBy: 'id ASC',
    numberFields: ['load_capacity', 'volume_capacity', 'warehouse_id', 'driver_id', 'mileage'],
    writeRoles: ['admin', 'dispatcher'],
  }));

  // 司机
  app.use(`${api}/entities/drivers`, requireAuth, crudRoutes({
    db, table: 'drivers',
    fields: ['name', 'phone', 'license_no', 'warehouse_id', 'vehicle_id', 'status', 'rating', 'completed_count', 'note'],
    required: ['name'],
    searchable: ['name', 'phone', 'license_no'],
    filterable: ['status', 'warehouse_id', 'vehicle_id'],
    ownerColumn: null,
    sharedColumn: 'user_id',
    orderBy: 'id ASC',
    numberFields: ['warehouse_id', 'vehicle_id', 'rating', 'completed_count'],
    writeRoles: ['admin', 'dispatcher'],
  }));

  // 收寄件人
  app.use(`${api}/entities/customers`, requireAuth, crudRoutes({
    db, table: 'customers',
    fields: ['name', 'phone', 'role_type', 'province', 'city', 'district', 'address', 'lat', 'lng', 'company', 'note'],
    required: ['name'],
    searchable: ['name', 'phone', 'address', 'company'],
    filterable: ['role_type', 'city', 'province'],
    ownerColumn: null,
    sharedColumn: 'user_id',
    orderBy: 'id DESC',
    numberFields: ['lat', 'lng'],
    writeRoles: ['admin', 'dispatcher'],
  }));

  // 包裹明细
  app.use(`${api}/entities/packages`, requireAuth, crudRoutes({
    db, table: 'packages',
    fields: ['waybill_id', 'name', 'quantity', 'weight', 'volume', 'goods_type', 'note'],
    required: ['waybill_id', 'name'],
    searchable: ['name', 'goods_type', 'note'],
    filterable: ['waybill_id', 'goods_type'],
    ownerColumn: null,
    orderBy: 'id ASC',
    numberFields: ['waybill_id', 'quantity', 'weight', 'volume'],
  }));

  // 中转节点（只读为主，写操作限调度角色）
  app.use(`${api}/entities/route-nodes`, requireAuth, crudRoutes({
    db, table: 'route_nodes',
    fields: ['waybill_id', 'seq', 'node_type', 'warehouse_id', 'name', 'city', 'lat', 'lng', 'node_status', 'operator', 'arrived_at', 'departed_at', 'remark'],
    required: ['waybill_id', 'name'],
    searchable: ['name', 'city', 'operator', 'remark'],
    filterable: ['waybill_id', 'node_type', 'node_status', 'warehouse_id'],
    ownerColumn: null,
    orderBy: 'waybill_id ASC, seq ASC',
    numberFields: ['waybill_id', 'seq', 'warehouse_id', 'lat', 'lng'],
    writeRoles: ['admin', 'dispatcher'],
  }));

  // 扫描记录（写操作走 /waybills/:id/scan，这里保留通用接口供审计）
  app.use(`${api}/entities/scan-records`, requireAuth, crudRoutes({
    db, table: 'scan_records',
    fields: ['waybill_id', 'node_id', 'warehouse_id', 'scan_type', 'status_snapshot', 'operator', 'location', 'lat', 'lng', 'note'],
    required: ['waybill_id'],
    searchable: ['operator', 'location', 'note', 'status_snapshot'],
    filterable: ['waybill_id', 'scan_type', 'warehouse_id', 'status_snapshot'],
    ownerColumn: null,
    orderBy: 'id DESC',
    numberFields: ['waybill_id', 'node_id', 'warehouse_id', 'lat', 'lng'],
    writeRoles: ['admin', 'dispatcher', 'courier'],
  }));

  // 通知
  app.use(`${api}/entities/notifications`, requireAuth, crudRoutes({
    db, table: 'notifications',
    fields: ['waybill_id', 'title', 'body', 'ntype', 'is_read'],
    required: ['title'],
    searchable: ['title', 'body'],
    filterable: ['ntype', 'is_read', 'waybill_id'],
    ownerColumn: 'user_id',
    orderBy: 'id DESC',
    numberFields: ['waybill_id', 'is_read'],
  }));

  // 状态流转日志（审计）
  app.use(`${api}/entities/status-logs`, requireAuth, crudRoutes({
    db, table: 'status_logs',
    fields: ['waybill_id', 'from_status', 'to_status', 'operator', 'note'],
    required: ['waybill_id', 'to_status'],
    searchable: ['operator', 'note', 'from_status', 'to_status'],
    filterable: ['waybill_id', 'to_status', 'from_status'],
    ownerColumn: null,
    orderBy: 'id DESC',
    numberFields: ['waybill_id'],
    writeRoles: ['admin', 'dispatcher'],
  }));
}

module.exports = { mountRoutes, roleOnly };
