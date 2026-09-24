// Admin 概览的业务指标。内核已提供 users 计数，这里补充本系统的统计。
'use strict';
const { WORK_ORDER_STATUS, STATUS_LABEL } = require('./src/workflow');

module.exports = (db) => () => {
  const one = (sql, ...a) => { try { return db.prepare(sql).get(...a)?.c || 0; } catch { return 0; } };
  const all = (sql, ...a) => { try { return db.prepare(sql).all(...a); } catch { return []; } };

  // 工单状态分布：前端仪表盘直接画，缺的状态补 0 保证图例完整。
  const counts = Object.fromEntries(
    all('SELECT status, COUNT(*) AS c FROM work_orders GROUP BY status').map((r) => [r.status, r.c])
  );
  const work_orders_by_status = WORK_ORDER_STATUS.map((s) => ({
    status: s, label: STATUS_LABEL[s], count: counts[s] || 0,
  }));

  // 近 14 天工单创建趋势，用真实 created_at 聚合。
  const trend = all(
    `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS c
     FROM work_orders GROUP BY day ORDER BY day ASC`
  );

  return {
    facilities_total: one('SELECT COUNT(*) AS c FROM facilities'),
    inspections_total: one('SELECT COUNT(*) AS c FROM inspections'),
    faults_total: one('SELECT COUNT(*) AS c FROM faults'),
    work_orders_total: one('SELECT COUNT(*) AS c FROM work_orders'),
    work_orders_open: one("SELECT COUNT(*) AS c FROM work_orders WHERE status NOT IN ('closed')"),
    districts_total: one('SELECT COUNT(*) AS c FROM districts'),
    teams_total: one('SELECT COUNT(*) AS c FROM maintenance_teams'),
    routes_total: one('SELECT COUNT(*) AS c FROM inspection_routes'),
    notifications_unread: one('SELECT COUNT(*) AS c FROM notifications WHERE read = 0'),
    faults_pending: one("SELECT COUNT(*) AS c FROM faults WHERE status = '待处理'"),
    facilities_fault: one("SELECT COUNT(*) AS c FROM facilities WHERE status = '故障'"),
    work_orders_by_status,
    work_orders_trend: trend,
    // 区域维度：设施数与工单数，区域管理页也复用这段统计口径。
    district_stats: all(
      `SELECT d.id, d.name, d.code,
              (SELECT COUNT(*) FROM facilities f WHERE f.district_id = d.id) AS facilities,
              (SELECT COUNT(*) FROM work_orders w JOIN facilities f2 ON f2.id = w.facility_id WHERE f2.district_id = d.id) AS work_orders
       FROM districts d ORDER BY d.id ASC`
    ),
    // 班组负载：进度条数据源。
    team_load: all(
      `SELECT id, name, leader, active_jobs, capacity,
              CAST(active_jobs AS REAL) / CASE WHEN capacity > 0 THEN capacity ELSE 1 END AS load
       FROM maintenance_teams ORDER BY load DESC`
    ),
  };
};
