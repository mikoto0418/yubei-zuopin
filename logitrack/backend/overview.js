// Admin 概览的业务指标。内核已提供 users 计数，这里补充物流域统计。
// 覆盖：统计卡（总量/在途/异常率/时效）+ 时效趋势 + 网点吞吐排行 + 状态分布。
'use strict';

module.exports = (db) => () => {
  const one = (sql, ...a) => {
    try { return db.prepare(sql).get(...a)?.c || 0; } catch { return 0; }
  };

  const total = one('SELECT COUNT(*) AS c FROM waybills');
  const delivered = one("SELECT COUNT(*) AS c FROM waybills WHERE status = 'delivered'");
  const inTransit = one("SELECT COUNT(*) AS c FROM waybills WHERE status IN ('picked_up','in_transit','arrived_hub','out_for_delivery')");
  const created = one("SELECT COUNT(*) AS c FROM waybills WHERE status = 'created'");
  const exception = one("SELECT COUNT(*) AS c FROM waybills WHERE status = 'exception'");
  const returned = one("SELECT COUNT(*) AS c FROM waybills WHERE status = 'returned'");
  const exceptionOpen = one("SELECT COUNT(*) AS c FROM exceptions WHERE ex_status IN ('open','processing')");
  const insuredCount = one('SELECT COUNT(*) AS c FROM waybills WHERE insured = 1');

  const freight = db.prepare('SELECT COALESCE(SUM(freight),0) AS s FROM waybills').get().s;
  const weight = db.prepare('SELECT COALESCE(SUM(weight),0) AS s FROM waybills').get().s;

  // 平均时效：已签收运单的实际耗时（小时）
  const avgRow = db.prepare(`
    SELECT AVG((julianday(actual_delivery) - julianday(created_at)) * 24) AS h
    FROM waybills WHERE status = 'delivered' AND actual_delivery != ''
  `).get();
  const avgHours = avgRow?.h ? Number(Number(avgRow.h).toFixed(1)) : 0;

  // 准时率：实际签收 <= 预计送达 的比例
  const onTimeRow = db.prepare(`
    SELECT COUNT(*) AS c FROM waybills
    WHERE status = 'delivered' AND actual_delivery != '' AND estimated_delivery != ''
      AND julianday(actual_delivery) <= julianday(estimated_delivery)
  `).get();
  const onTimeRate = delivered ? Number(((onTimeRow.c / delivered) * 100).toFixed(1)) : 0;

  // 时效趋势：近 10 天每天的签收量与平均耗时
  const trend = db.prepare(`
    SELECT substr(created_at, 1, 10) AS day,
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
           SUM(CASE WHEN status IN ('exception','returned') THEN 1 ELSE 0 END) AS abn,
           ROUND(AVG(CASE WHEN status='delivered' AND actual_delivery != ''
                THEN (julianday(actual_delivery) - julianday(created_at)) * 24 END), 1) AS avg_hours
    FROM waybills
    GROUP BY substr(created_at, 1, 10)
    ORDER BY day ASC
  `).all();

  // 网点吞吐排行：以"经过该网点的节点数"作为吞吐量口径
  const warehouseRank = db.prepare(`
    SELECT w.id, w.name, w.city,
           COUNT(n.id) AS throughput,
           SUM(CASE WHEN n.node_type IN ('hub','transit') THEN 1 ELSE 0 END) AS transit_count,
           SUM(CASE WHEN n.node_type = 'exception' THEN 1 ELSE 0 END) AS exception_count
    FROM warehouses w LEFT JOIN route_nodes n ON n.warehouse_id = w.id
    GROUP BY w.id ORDER BY throughput DESC
  `).all();

  // 状态分布（前端环形图）
  const statusDist = db.prepare('SELECT status AS k, COUNT(*) AS c FROM waybills GROUP BY status').all();

  // 异常类型分布
  const exceptionDist = db.prepare('SELECT ex_type AS k, COUNT(*) AS c FROM exceptions GROUP BY ex_type').all();

  // 司机负载（前 6 名，按在途运单数）
  const driverLoad = db.prepare(`
    SELECT d.id, d.name, d.status, d.rating, d.completed_count,
           (SELECT COUNT(*) FROM waybills w WHERE w.driver_id = d.id AND w.status NOT IN ('delivered','returned')) AS active_tasks
    FROM drivers d ORDER BY active_tasks DESC, d.completed_count DESC LIMIT 6
  `).all();

  return {
    // 统计卡
    waybills_total: total,
    waybills_delivered: delivered,
    waybills_in_transit: inTransit,
    waybills_created: created,
    waybills_exception: exception,
    waybills_returned: returned,
    exceptions_open: exceptionOpen,
    exception_rate: total ? Number(((exception + returned) / total * 100).toFixed(1)) : 0,
    on_time_rate: onTimeRate,
    avg_delivery_hours: avgHours,
    freight_total: Number(Number(freight).toFixed(2)),
    weight_total: Number(Number(weight).toFixed(2)),
    insured_total: insuredCount,

    // 资源
    warehouses_total: one('SELECT COUNT(*) AS c FROM warehouses'),
    vehicles_total: one('SELECT COUNT(*) AS c FROM vehicles'),
    drivers_total: one('SELECT COUNT(*) AS c FROM drivers'),
    customers_total: one('SELECT COUNT(*) AS c FROM customers'),
    packages_total: one('SELECT COUNT(*) AS c FROM packages'),
    scans_total: one('SELECT COUNT(*) AS c FROM scan_records'),
    nodes_total: one('SELECT COUNT(*) AS c FROM route_nodes'),
    notifications_unread: one('SELECT COUNT(*) AS c FROM notifications WHERE is_read = 0'),

    // 图表数据
    trend,
    warehouse_rank: warehouseRank,
    status_dist: statusDist,
    exception_dist: exceptionDist,
    driver_load: driverLoad,
  };
};
