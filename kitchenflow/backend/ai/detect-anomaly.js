// AI 异常识别：找出长时间未接单 / 超时未出餐 / 出餐未上菜的订单并告警。
'use strict';
const { ok, fail } = require('../src/http');
const ai = require('../src/ai');

// 阈值（分钟）：超过即视为异常。
const THRESHOLDS = { pending: 5, accepted: 8, cooking: 20, ready: 8 };

module.exports = (db) => async (req, res) => {
  try {
    // 用 SQLite 的时间差算出每张进行中订单在各阶段已停留的分钟数。
    const rows = db.prepare(`
      SELECT o.id, o.order_no, o.status, o.created_at, o.accepted_at, o.cooking_at, o.ready_at,
             t.table_no,
             CAST((julianday('now','localtime') - julianday(o.created_at)) * 1440 AS INTEGER) AS created_ago,
             CAST((julianday('now','localtime') - julianday(o.accepted_at)) * 1440 AS INTEGER) AS accepted_ago,
             CAST((julianday('now','localtime') - julianday(o.cooking_at)) * 1440 AS INTEGER) AS cooking_ago,
             CAST((julianday('now','localtime') - julianday(o.ready_at)) * 1440 AS INTEGER) AS ready_ago
      FROM orders o
      LEFT JOIN dining_tables t ON t.id = o.table_id
      WHERE o.status IN ('pending','accepted','cooking','ready')
      ORDER BY o.id ASC
    `).all();

    const alerts = [];
    for (const r of rows) {
      let minutes = 0;
      let level = 'info';
      let reason = '';
      if (r.status === 'pending' && r.created_ago > THRESHOLDS.pending) {
        minutes = r.created_ago; level = 'critical'; reason = `下单后 ${minutes} 分钟仍未接单`;
      } else if (r.status === 'accepted' && r.accepted_ago > THRESHOLDS.accepted) {
        minutes = r.accepted_ago; level = 'warning'; reason = `接单后 ${minutes} 分钟仍未开火`;
      } else if (r.status === 'cooking' && r.cooking_ago > THRESHOLDS.cooking) {
        minutes = r.cooking_ago; level = 'critical'; reason = `制作已持续 ${minutes} 分钟，超出档口承诺时长`;
      } else if (r.status === 'ready' && r.ready_ago > THRESHOLDS.ready) {
        minutes = r.ready_ago; level = 'warning'; reason = `出餐后 ${minutes} 分钟仍未上菜`;
      }
      if (reason) {
        alerts.push({
          order_id: r.id, order_no: r.order_no, table_no: r.table_no || '-',
          status: r.status, minutes, level, reason,
        });
      }
    }

    // 档口维度：某档口积压任务过多也计入告警。
    const backlog = db.prepare(`
      SELECT s.id, s.name, COUNT(*) AS c
      FROM station_tasks tk JOIN kitchen_stations s ON s.id = tk.station_id
      WHERE tk.status = 'pending'
      GROUP BY s.id HAVING c >= 3
    `).all();
    for (const b of backlog) {
      alerts.push({
        order_id: null, order_no: '-', table_no: '-', status: 'backlog',
        minutes: 0, level: 'warning',
        reason: `${b.name} 积压 ${b.c} 个待制作任务，建议增派人手`,
      });
    }

    const buildLocal = () => {
      if (!alerts.length) return '当前所有订单均在正常时效内，无异常。';
      return ['## 异常订单告警', ...alerts.map((a, i) =>
        `${i + 1}. [${a.level === 'critical' ? '严重' : '提醒'}] 订单 ${a.order_no}（桌 ${a.table_no}）：${a.reason}`)].join('\n');
    };

    const result = await ai.generate(
      [
        { role: 'system', content: '你是餐厅运营值班经理。根据订单各阶段停留时长与档口积压情况，列出需要立即干预的异常并给出处置建议。中文分点，简洁。' },
        { role: 'user', content: JSON.stringify(alerts) },
      ],
      buildLocal,
      { temperature: 0.3 }
    );

    return ok(res, {
      text: result.text,
      source: result.source,
      total: alerts.length,
      critical: alerts.filter((a) => a.level === 'critical').length,
      alerts,
      thresholds: THRESHOLDS,
    });
  } catch (e) {
    return fail(res, 500, 'AI 服务异常：' + e.message);
  }
};
