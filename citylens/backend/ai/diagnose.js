// AI 故障诊断：配置了 LLM_API_KEY 走大模型，否则本地规则降级。
'use strict';
const { ok, fail } = require('../src/http');
const ai = require('../src/ai');

module.exports = (db) => async (req, res) => {
  try {
    const input = req.body || {};
    const desc = input.description || '';
    const sev = input.severity || '一般';
    const buildLocal = () => [
      '## 故障诊断建议',
      `- 故障描述：${desc || '（未填写）'}`,
      `- 严重程度：${sev}`,
      '- 可能原因：线路老化 / 接触不良 / 外部损伤（需现场确认）',
      '- 所需工具：万用表、绝缘胶带、备用灯头、梯子',
      '- 预计工时：1.5 小时（含往返）',
      '- 临时处置：设置警示标识，夜间加装临时照明',
      '- 建议派工：2 人小组，优先处理高severity工单',
    ].join('\n');
    const result = await ai.generate(
      [{ role: 'system', content: "你是市政设施运维专家。根据故障描述判断可能原因、所需工具、预计工时和临时处置建议。中文，分点输出，简洁实用。" }, { role: 'user', content: JSON.stringify(input) }],
      buildLocal,
      { temperature: 0.7 }
    );
    return ok(res, { text: result.text, source: result.source });
  } catch (e) {
    return fail(res, 500, 'AI 服务异常：' + e.message);
  }
};
