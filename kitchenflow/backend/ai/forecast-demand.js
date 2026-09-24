// AI 销量预测：基于近 7 天各菜品销量预测次日需求，并把结果写入 menu_items.predicted_demand。
'use strict';
const { ok, fail } = require('../src/http');
const ai = require('../src/ai');

module.exports = (db) => async (req, res) => {
  try {
    // 统计近 7 天每个菜品的实际销量。
    const history = db.prepare(`
      SELECT m.id, m.name, m.price, m.category_id, m.station_id,
             COALESCE(SUM(oi.quantity), 0) AS sold_7d
      FROM menu_items m
      LEFT JOIN order_items oi ON oi.menu_item_id = m.id
      LEFT JOIN orders o ON o.id = oi.order_id
        AND o.status NOT IN ('cancelled')
        AND date(o.created_at) >= date('now','localtime','-6 days')
      GROUP BY m.id
      ORDER BY sold_7d DESC
    `).all();

    // 本地规则：按近 7 天日均销量 ×1.1 上浮（次日备料安全系数），向上取整。
    const localForecast = history.map((h) => {
      const daily = h.sold_7d / 7;
      return { id: h.id, name: h.name, predicted: Math.max(1, Math.round(daily * 1.1)) };
    });

    const buildLocal = () => localForecast
      .slice(0, 12)
      .map((f) => `${f.name}：预计 ${f.predicted} 份`)
      .join('\n');

    const result = await ai.generate(
      [
        { role: 'system', content: '你是餐厅后厨的备料预测助手。根据菜品近 7 天销量给出次日各菜品建议备料份数，输出简洁列表。' },
        { role: 'user', content: JSON.stringify(history.slice(0, 20)) },
      ],
      buildLocal,
      { temperature: 0.4 }
    );

    // 无论大模型还是本地规则，最终预测值一律落库，驱动菜单页展示与备料清单。
    const upd = db.prepare('UPDATE menu_items SET predicted_demand = ? WHERE id = ?');
    const tx = db.transaction(() => { for (const f of localForecast) upd.run(f.predicted, f.id); });
    tx();

    const items = db.prepare(`
      SELECT m.id, m.name, m.price, m.predicted_demand, m.sales_count, c.name AS category_name, s.name AS station_name
      FROM menu_items m
      LEFT JOIN menu_categories c ON c.id = m.category_id
      LEFT JOIN kitchen_stations s ON s.id = m.station_id
      ORDER BY m.predicted_demand DESC
    `).all();

    return ok(res, { text: result.text, source: result.source, updated: items.length, items });
  } catch (e) {
    return fail(res, 500, 'AI 服务异常：' + e.message);
  }
};
