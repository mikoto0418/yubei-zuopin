// 路由装配：内核通用能力 + 本系统专属订单/AI 路由。
'use strict';
const { authRoutes, adminRoutes, crudRoutes, requireAuth, adminOnly } = require('./kernel');
const { db } = require('./db');

function mountRoutes(app, api) {
  // ---- 认证（注册可选角色：admin / waiter / chef）----
  app.use(`${api}/auth`, authRoutes({ db, extraColumns: ['nickname', 'avatar', 'phone', 'restaurant_id'] }));

  // ---- Admin 概览（仅店长）----
  app.use(`${api}/admin`, adminRoutes({ db, buildOverview: require('./overview')(db) }));

  // ---- 门店信息（仅店长可改）----
  app.use(`${api}/entities/restaurants`, requireAuth, adminOnly, crudRoutes({
    db, table: 'restaurants',
    fields: ['name', 'address', 'phone', 'open_time', 'close_time', 'description'],
    required: ['name'],
    searchable: ['name', 'address'],
    filterable: [],
    ownerColumn: null,
    orderBy: 'id ASC',
  }));

  // ---- 桌台 ----
  app.use(`${api}/entities/tables`, requireAuth, crudRoutes({
    db, table: 'dining_tables',
    fields: ['restaurant_id', 'table_no', 'seats', 'zone', 'status', 'current_order_id', 'note'],
    required: ['table_no'],
    searchable: ['table_no', 'zone'],
    filterable: ['status', 'zone'],
    ownerColumn: null,
    numberFields: ['seats', 'restaurant_id', 'current_order_id'],
    orderBy: 'id ASC',
  }));

  // ---- 菜单分类 ----
  app.use(`${api}/entities/categories`, requireAuth, crudRoutes({
    db, table: 'menu_categories',
    fields: ['restaurant_id', 'name', 'sort_order', 'description'],
    required: ['name'],
    searchable: ['name', 'description'],
    filterable: [],
    ownerColumn: null,
    numberFields: ['sort_order', 'restaurant_id'],
    orderBy: 'sort_order ASC, id ASC',
  }));

  // ---- 档口 ----
  app.use(`${api}/entities/stations`, requireAuth, crudRoutes({
    db, table: 'kitchen_stations',
    fields: ['restaurant_id', 'name', 'code', 'color', 'sort_order', 'description'],
    required: ['name'],
    searchable: ['name', 'code', 'description'],
    filterable: [],
    ownerColumn: null,
    numberFields: ['sort_order', 'restaurant_id'],
    orderBy: 'sort_order ASC, id ASC',
  }));

  // ---- 菜品 ----
  app.use(`${api}/entities/menu-items`, requireAuth, crudRoutes({
    db, table: 'menu_items',
    fields: ['restaurant_id', 'category_id', 'station_id', 'name', 'price', 'image_url',
      'description', 'cooking_method', 'prep_minutes', 'available', 'predicted_demand'],
    required: ['name', 'category_id'],
    searchable: ['name', 'description', 'cooking_method'],
    filterable: ['category_id', 'station_id', 'available'],
    ownerColumn: null,
    numberFields: ['price', 'prep_minutes', 'category_id', 'station_id', 'available', 'predicted_demand', 'restaurant_id'],
    orderBy: 'id ASC',
  }));

  // ---- 订单明细 ----
  app.use(`${api}/entities/order-items`, requireAuth, crudRoutes({
    db, table: 'order_items',
    fields: ['order_id', 'menu_item_id', 'name_snapshot', 'price', 'quantity', 'amount', 'note', 'station_id', 'status'],
    required: ['order_id', 'name_snapshot'],
    searchable: ['name_snapshot', 'note'],
    filterable: ['order_id', 'station_id', 'status'],
    ownerColumn: null,
    numberFields: ['order_id', 'menu_item_id', 'price', 'quantity', 'amount', 'station_id'],
    orderBy: 'id ASC',
  }));

  // ---- 状态流转日志 ----
  app.use(`${api}/entities/status-logs`, requireAuth, crudRoutes({
    db, table: 'order_status_logs',
    fields: ['order_id', 'from_status', 'to_status', 'operator_id', 'operator_name', 'note'],
    required: ['order_id', 'to_status'],
    searchable: ['operator_name', 'note'],
    filterable: ['order_id', 'to_status'],
    ownerColumn: null,
    numberFields: ['order_id', 'operator_id'],
    orderBy: 'id ASC',
  }));

  // ---- 档口任务 ----
  app.use(`${api}/entities/tasks`, requireAuth, crudRoutes({
    db, table: 'station_tasks',
    fields: ['order_id', 'order_item_id', 'station_id', 'dish_name', 'quantity', 'status', 'chef_id', 'note'],
    required: ['order_id', 'station_id'],
    searchable: ['dish_name', 'note'],
    filterable: ['order_id', 'station_id', 'status'],
    ownerColumn: null,
    numberFields: ['order_id', 'order_item_id', 'station_id', 'quantity', 'chef_id'],
    orderBy: 'id DESC',
  }));

  // ---- 员工班次 ----
  app.use(`${api}/entities/shifts`, requireAuth, crudRoutes({
    db, table: 'staff_shifts',
    fields: ['restaurant_id', 'user_id', 'shift_date', 'start_time', 'end_time', 'role', 'status', 'note'],
    required: ['user_id', 'shift_date'],
    searchable: ['shift_date', 'note'],
    filterable: ['user_id', 'shift_date', 'role', 'status'],
    ownerColumn: null,
    numberFields: ['user_id', 'restaurant_id'],
    orderBy: 'shift_date DESC, id ASC',
  }));

  // ---- 订单专属路由（状态机 + 档口任务 + 看板）----
  app.use(`${api}/orders`, requireAuth, require('./src/routes/orders')(db));

  // ---- AI 三个功能点 ----
  const forecast = require('./ai/forecast-demand')(db);
  const prepList = require('./ai/prep-list')(db);
  const anomaly = require('./ai/detect-anomaly')(db);
  app.post(`${api}/ai/forecast-demand`, requireAuth, adminOnly, forecast); // 会写库，限店长
  app.post(`${api}/ai/prep-list`, requireAuth, prepList);
  app.post(`${api}/ai/detect-anomaly`, requireAuth, anomaly);

  // ---- 员工列表（班次排班需要选择员工；不含密码）----
  app.get(`${api}/staff`, requireAuth, (req, res) => {
    const rows = db.prepare('SELECT id, username, nickname, role, phone FROM users ORDER BY id ASC').all();
    return require('./src/http').ok(res, rows);
  });
}

module.exports = { mountRoutes };
