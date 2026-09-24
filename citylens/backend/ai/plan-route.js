// AI 巡检路线规划：配置了 LLM_API_KEY 走大模型，否则本地规则降级。
'use strict';
const { ok, fail } = require('../src/http');
const ai = require('../src/ai');

module.exports = (db) => async (req, res) => {
  try {
    const input = req.body || {};
    const list = input.facilities || [];
    const buildLocal = () => {
      if (!list.length) return '当前无待巡检设施。';
      const lines = list.slice(0, 8).map((f, i) => `${i + 1}. ${f.name}（${f.address || '地址未填'}）`);
      return ['## 建议巡检路线', ...lines, '', `共 ${list.length} 个点位，预计耗时 ${(list.length * 0.4).toFixed(1)} 小时（含路途）`].join('\n');
    };
    const result = await ai.generate(
      [{ role: 'system', content: "你是巡检调度专家。根据待检设施清单规划最优巡检路线，考虑地理位置就近原则，输出顺序与预计耗时。中文。" }, { role: 'user', content: JSON.stringify(input) }],
      buildLocal,
      { temperature: 0.7 }
    );
    return ok(res, { text: result.text, source: result.source });
  } catch (e) {
    return fail(res, 500, 'AI 服务异常：' + e.message);
  }
};
