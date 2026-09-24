// AI 备料清单：按 menu_items.predicted_demand（预测结果）生成各档口备料清单。
'use strict';
const { ok, fail } = require('../src/http');
const ai = require('../src/ai');

// 主料换算表：把「份数」折算成「采购量」，让备料清单可执行。
const INGREDIENTS = {
  宫保鸡丁: '鸡腿肉 0.25kg / 花生米 0.05kg',
  鱼香肉丝: '猪里脊 0.2kg / 木耳 0.05kg',
  麻婆豆腐: '嫩豆腐 1盒 / 牛肉末 0.1kg',
  红烧肉: '五花肉 0.3kg',
  水煮牛肉: '牛里脊 0.25kg / 豆芽 0.1kg',
  干煸四季豆: '四季豆 0.25kg / 肉末 0.08kg',
  辣子鸡: '鸡腿肉 0.3kg / 干辣椒 0.03kg',
  番茄炒蛋: '番茄 0.3kg / 鸡蛋 2个',
  拍黄瓜: '黄瓜 0.25kg',
  口水鸡: '土鸡 0.3kg',
  凉拌木耳: '秋木耳 0.06kg',
  夫妻肺片: '牛腱 0.2kg / 牛肚 0.1kg',
  皮蛋豆腐: '内酯豆腐 1盒 / 皮蛋 1个',
  蛋炒饭: '隔夜米饭 0.3kg / 鸡蛋 1个',
  阳春面: '细面 0.15kg',
  担担面: '细面 0.15kg / 芝麻酱 0.03kg',
  米饭: '珍珠米 0.2kg',
  手工水饺: '饺子皮 12张 / 猪肉白菜馅 0.2kg',
  鲜榨橙汁: '鲜橙 4个',
  柠檬水: '柠檬 0.5个',
  冰镇酸梅汤: '酸梅汤底 0.3L',
  可乐: '听装可乐 1罐',
  珍珠奶茶: '珍珠 0.05kg / 鲜奶 0.2L',
  西红柿蛋汤: '番茄 0.2kg / 鸡蛋 1个',
  紫菜蛋花汤: '紫菜 0.01kg / 鸡蛋 1个',
};

module.exports = (db) => async (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT m.id, m.name, m.predicted_demand, m.prep_minutes, s.name AS station_name, s.id AS station_id
      FROM menu_items m
      LEFT JOIN kitchen_stations s ON s.id = m.station_id
      WHERE m.predicted_demand > 0
      ORDER BY s.sort_order, m.predicted_demand DESC
    `).all();

    // 按档口聚合，生成结构化清单。
    const byStation = {};
    for (const r of rows) {
      const key = r.station_name || '未分配';
      if (!byStation[key]) byStation[key] = [];
      byStation[key].push({
        name: r.name,
        demand: r.predicted_demand,
        ingredient: INGREDIENTS[r.name] || '按标准配方',
        prep_minutes: r.prep_minutes,
      });
    }

    const buildLocal = () => {
      const lines = ['## 次日备料清单'];
      for (const [station, list] of Object.entries(byStation)) {
        lines.push(`\n### ${station}`);
        for (const it of list) {
          lines.push(`- ${it.name} ×${it.demand}｜${it.ingredient}｜单份 ${it.prep_minutes} 分钟`);
        }
      }
      if (rows.length === 0) lines.push('暂无预测数据，请先执行销量预测。');
      return lines.join('\n');
    };

    const result = await ai.generate(
      [
        { role: 'system', content: '你是餐厅后厨的备料主管。根据各菜品预测份数与主料配方，输出按档口分组的备料清单，包含采购量与预处理耗时。中文分点。' },
        { role: 'user', content: JSON.stringify(byStation) },
      ],
      buildLocal,
      { temperature: 0.5 }
    );

    const totalPortions = rows.reduce((s, r) => s + r.predicted_demand, 0);
    return ok(res, {
      text: result.text,
      source: result.source,
      total_portions: totalPortions,
      stations: Object.entries(byStation).map(([name, list]) => ({ name, items: list })),
    });
  } catch (e) {
    return fail(res, 500, 'AI 服务异常：' + e.message);
  }
};
