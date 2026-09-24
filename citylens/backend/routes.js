// 抽出挂载函数，使 server.js 与测试共用同一套路由装配。
'use strict';
const { authRoutes, adminRoutes, crudRoutes, requireAuth } = require('./kernel');
const { db } = require('./db');
const workOrderRoutes = require('./src/routes/workOrders');

function mountRoutes(app, api) {
  app.use(`${api}/auth`, authRoutes({ db, extraColumns: ['district', 'phone'] }));
  app.use(`${api}/admin`, adminRoutes({ db, buildOverview: require('./overview')(db) }));

  // 设施 / 巡检 / 故障是"全员共同维护"的城市资产：所有登录用户都可读写，
  // 因此用 shared: true 关闭归属过滤（创建人仍记录在 user_id 上）。
  app.use(`${api}/entities/facilities`, requireAuth, crudRoutes({
    db, table: 'facilities',
    fields: ['name', 'category', 'address', 'lat', 'lng', 'status', 'installed_at', 'note', 'district_id', 'type_id'],
    required: ['name'],
    searchable: ['name', 'address', 'note'],
    filterable: ['category', 'status', 'district_id', 'type_id'],
    ownerColumn: 'user_id',
    shared: true,
    numberFields: ['lat', 'lng', 'district_id', 'type_id'],
  }));

  app.use(`${api}/entities/inspections`, requireAuth, crudRoutes({
    db, table: 'inspections',
    fields: ['facility_id', 'result', 'inspector', 'note', 'inspected_at', 'route_id'],
    required: ['facility_id'],
    searchable: ['inspector', 'note'],
    filterable: ['facility_id', 'result', 'route_id'],
    ownerColumn: 'user_id',
    shared: true,
    numberFields: ['facility_id', 'route_id'],
  }));

  app.use(`${api}/entities/faults`, requireAuth, crudRoutes({
    db, table: 'faults',
    fields: ['facility_id', 'title', 'description', 'severity', 'status', 'reporter', 'diagnosis', 'diagnosed_at'],
    required: ['facility_id', 'title'],
    searchable: ['title', 'description', 'diagnosis'],
    filterable: ['status', 'severity', 'facility_id'],
    ownerColumn: 'user_id',
    shared: true,
    numberFields: ['facility_id'],
  }));

  // 字典 / 主数据：区域、设施类型、班组、巡检路线（管理员可写，登录即可读）
  app.use(`${api}/entities/districts`, requireAuth, crudRoutes({
    db, table: 'districts',
    fields: ['name', 'code', 'center_lat', 'center_lng', 'note'],
    required: ['name', 'code'],
    searchable: ['name', 'code', 'note'],
    ownerColumn: null,
    numberFields: ['center_lat', 'center_lng'],
  }));

  app.use(`${api}/entities/facility-types`, requireAuth, crudRoutes({
    db, table: 'facility_types',
    fields: ['name', 'icon', 'default_cycle_days', 'note'],
    required: ['name'],
    searchable: ['name', 'note'],
    ownerColumn: null,
    numberFields: ['default_cycle_days'],
  }));

  app.use(`${api}/entities/maintenance-teams`, requireAuth, crudRoutes({
    db, table: 'maintenance_teams',
    fields: ['name', 'leader', 'phone', 'specialties', 'capacity', 'active', 'note'],
    required: ['name'],
    searchable: ['name', 'leader', 'specialties'],
    filterable: ['active'],
    ownerColumn: null,
    numberFields: ['capacity', 'active'],
  }));

  // 路线含 facility_ids（JSON 字符串），读时解析成数组供前端直接画有序点位。
  app.use(`${api}/entities/inspection-routes`, requireAuth, crudRoutes({
    db, table: 'inspection_routes',
    fields: ['name', 'district_id', 'facility_ids', 'cycle', 'note'],
    required: ['name'],
    searchable: ['name', 'note'],
    filterable: ['district_id', 'cycle'],
    ownerColumn: null,
    numberFields: ['district_id'],
    shape: (r) => {
      let ids = [];
      try { ids = JSON.parse(r.facility_ids || '[]'); } catch { ids = []; }
      return { ...r, facility_ids: ids };
    },
  }));

  // 工单：专属路由（状态机 + 日志时间轴 + 筛选分页）
  app.use(`${api}/work-orders`, requireAuth, workOrderRoutes({ db }));

  // 我的通知
  app.get(`${api}/notifications`, requireAuth, (req, res) => {
    const { ok } = require('./src/http');
    const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id);
    const unread = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0').get(req.user.id).c;
    return ok(res, { list: rows, unread });
  });
  app.patch(`${api}/notifications/:id/read`, requireAuth, (req, res) => {
    const { ok, fail } = require('./src/http');
    const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(Number(req.params.id));
    if (!row) return fail(res, 404, '通知不存在');
    if (row.user_id !== req.user.id) return fail(res, 403, '无权操作该通知');
    db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(row.id);
    return ok(res, { id: row.id }, '已标记为已读');
  });

  // 领域专属 AI 路由
  app.post(`${api}/faults/:id/diagnose`, requireAuth, require('./ai/diagnose-fault')(db));
  app.post(`${api}/ai/dispatch`, requireAuth, require('./ai/dispatch')(db));
  app.post(`${api}/ai/diagnose`, requireAuth, require('./ai/diagnose')(db));
  app.post(`${api}/ai/plan-route`, requireAuth, require('./ai/plan-route')(db));
}

module.exports = { mountRoutes };
