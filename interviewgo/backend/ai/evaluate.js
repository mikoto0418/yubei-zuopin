// AI 评估报告：轮次评分参与计算，配置了 LLM_API_KEY 走大模型，否则本地规则降级。
'use strict';
const { ok, fail, toNumber } = require('../src/http');
const ai = require('../src/ai');
const { clamp } = require('../domain/scoring');

module.exports = (db) => async (req, res) => {
  try {
    const input = req.body || {};
    const msgs = input.messages || [];
    const answers = msgs.filter((m) => m.role === 'user');
    const sessionId = input.session_id ? toNumber(input.session_id) : null;

    // 有真实轮次评分时以轮次为准，避免 LLM 与规则口径不一致
    let rounds = [];
    if (sessionId) {
      rounds = db.prepare('SELECT * FROM interview_rounds WHERE session_id = ? ORDER BY round_no ASC').all(sessionId);
    }
    const avgOf = (key) => (rounds.length ? Math.round(rounds.reduce((s, r) => s + (r[key] || 0), 0) / rounds.length) : 0);

    const avgLen = answers.length ? answers.reduce((s, m) => s + (m.content || '').length, 0) / answers.length : 0;
    const logic = avgOf('overall') ? clamp(avgOf('overall') + 4, 0, 100) : Math.min(95, 55 + answers.length * 4);
    const depth = avgOf('depth_score') || Math.min(92, 50 + Math.round(avgLen / 8));
    const expression = avgOf('clarity_score') || Math.min(94, 58 + Math.round(avgLen / 10));
    const overall = Math.round((logic + depth + expression) / 3);

    const buildLocal = () => JSON.stringify({
      logic, depth, expression, overall,
      summary: `本次面试共 ${rounds.length || answers.length} 轮问答，回答平均长度 ${Math.round(avgLen)} 字。整体表现${overall >= 80 ? '优秀' : overall >= 65 ? '良好' : '有待提升'}。`,
      suggestions: [
        '回答时先给结论，再展开论据，避免绕圈子',
        '多用具体项目经历支撑观点，减少泛泛而谈',
        '遇到不会的问题，说明思路边界比直接放弃更好',
      ],
    }, null, 2);

    const result = await ai.generate(
      [
        { role: 'system', content: '你是面试评估专家。根据完整对话记录，对候选人做出结构化评估：逻辑性、专业深度、表达清晰度各 0-100 分，给出总评与三条具体改进建议。用 JSON 返回：{"logic":n,"depth":n,"expression":n,"overall":n,"summary":"...","suggestions":["...","...","..."]}。' },
        { role: 'user', content: JSON.stringify({ messages: msgs, rounds }) },
      ],
      buildLocal,
      { temperature: 0.7 },
    );

    return ok(res, { text: result.text, source: result.source });
  } catch (e) {
    return fail(res, 500, 'AI 服务异常：' + e.message);
  }
};
