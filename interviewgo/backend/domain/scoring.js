// 答案要点评分：AI 要点分析与轮次评分共用，保证口径一致。
'use strict';

const DEFAULT_POINTS = ['结论先行', '结构化展开', '具体案例', '数据支撑'];

/** 取题目的关键要点；没有题目时回落到通用要点 */
function pickKeyPoints(db, questionId) {
  if (questionId) {
    const row = db.prepare('SELECT key_points FROM question_bank WHERE id = ?').get(Number(questionId));
    if (row) {
      try {
        const pts = JSON.parse(row.key_points || '[]');
        if (Array.isArray(pts) && pts.length) return pts;
      } catch { /* 解析失败则回落 */ }
    }
  }
  return DEFAULT_POINTS;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

/**
 * 本地规则评分（LLM 不可用时的降级路径，也是测试的确定性依据）。
 * @returns {{hit:string[],missed:string[],tech:number,clarity:number,depth:number,overall:number,summary:string}}
 */
function scoreAnswer({ points, answer, index = 0 }) {
  const text = String(answer || '');
  const list = Array.isArray(points) && points.length ? points : DEFAULT_POINTS;
  const hit = list.filter((p) => text.includes(p));
  const missed = list.filter((p) => !text.includes(p));
  const ratio = hit.length / list.length;

  const tech = clamp(48 + ratio * 42 + Math.min(8, text.length / 90), 40, 96);
  const clarity = clamp(56 + Math.min(26, text.length / 16) + (text.includes('首先') || text.includes('第一') ? 4 : 0), 45, 95);
  const depth = clamp(tech - 3 + (index % 3) * 2 + (text.length > 120 ? 3 : 0), 40, 94);
  const overall = clamp((tech + clarity + depth) / 3, 0, 100);

  const summary = hit.length === list.length
    ? '要点覆盖完整，回答结构清晰，可再补一个具体案例增强说服力。'
    : `命中 ${hit.length}/${list.length} 个关键要点，遗漏部分建议结合项目经历补齐。`;

  return { hit, missed, tech, clarity, depth, overall, summary };
}

module.exports = { pickKeyPoints, scoreAnswer, DEFAULT_POINTS, clamp };
