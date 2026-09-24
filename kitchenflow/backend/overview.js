// Admin 概览业务指标：统计卡 + 订单趋势 + 档口效率排行。
'use strict';
module.exports = (db) => () => {
  const one = (sql, ...a) => { try { return db.prepare(sql).get(...a)?.c || 0; } catch { return 0; } };

  // 订单趋势：近 7 天每天的订单量与营业额。
  const trend = db.prepare(`
    SELECT date(created_at) AS day,
           COUNT(*) AS orders,
           COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END), 0) AS revenue
    FROM orders
    WHERE date(created_at) >= date('now','localtime','-6 days')
    GROUP BY day ORDER BY day ASC
  `).all();

  // 档口效率：完成任务的平均耗时（分钟）与完成数。
  const stations = db.prepare(`
    SELECT s.id, s.name,
           COUNT(tk.id) AS done_count,
           ROUND(AVG(CASE WHEN tk.finished_at IS NOT NULL AND tk.started_at IS NOT NULL
             THEN (julianday(tk.finished_at) - julianday(tk.started_at)) * 1440 END), 1) AS avg_minutes
    FROM kitchen_stations s
    LEFT JOIN station_tasks tk ON tk.station_id = s.id AND tk.status = 'done'
    GROUP BY s.id ORDER BY avg_minutes ASC
  `).all();

  // 状态分布，供概览页做占比展示。
  const statusDist = db.prepare('SELECT status, COUNT(*) AS c FROM orders GROUP BY status').all();

  return {
    restaurants: one('SELECT COUNT(*) AS c FROM restaurants'),
    tables: one('SELECT COUNT(*) AS c FROM dining_tables'),
    tables_occupied: one("SELECT COUNT(*) AS c FROM dining_tables WHERE status = 'occupied'"),
    menu_items: one('SELECT COUNT(*) AS c FROM menu_items'),
    orders_total: one('SELECT COUNT(*) AS c FROM orders'),
    orders_today: one("SELECT COUNT(*) AS c FROM orders WHERE date(created_at) = date('now','localtime')"),
    orders_active: one("SELECT COUNT(*) AS c FROM orders WHERE status IN ('pending','accepted','cooking','ready','served')"),
    revenue_total: one("SELECT COALESCE(SUM(total_amount),0) AS c FROM orders WHERE status = 'paid'"),
    revenue_today: one("SELECT COALESCE(SUM(total_amount),0) AS c FROM orders WHERE status = 'paid' AND date(created_at) = date('now','localtime')"),
    cancelled_total: one("SELECT COUNT(*) AS c FROM orders WHERE status = 'cancelled'"),
    tasks_pending: one("SELECT COUNT(*) AS c FROM station_tasks WHERE status != 'done'"),
    shifts_today: one("SELECT COUNT(*) AS c FROM staff_shifts WHERE shift_date = date('now','localtime')"),
    trend,
    stations,
    status_dist: statusDist,
  };
};
