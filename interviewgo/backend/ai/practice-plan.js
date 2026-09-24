// AI 弱项练习计划：基于低分技能维度自动生成，并写入 practice_plans。
'use strict';
const { ok, fail, toNumber } = require('../src/http');
const ai = require('../src/ai');
const { clamp } = require('../domain/scoring');

const THRESHOLD = 75; // 低于该分数的维度视为弱项
const MINUTES = (score) => (score < 55 ? 120 : score < 65 ? 90 : 60);

function levelOf(score) {
  if (score >= 85) return '优秀';
  if (score >= 70) return '良好';
  if (score >= 55) return '及格';
  return '待提升';
}

/** 依据弱项维度从题库挑选推荐题目 */
function pickQuestions(db, dimensionKey, positionId) {
  const byDim = {
    logic: [6, 7, 10, 11],
    depth: [1, 2, 3, 4],
    expression: [4, 6, 12, 21],
    tech: [0, 3, 4, 8],
    engineering: [2, 3, 11, 32],
  };
  const wanted = byDim[dimensionKey] || [];
  const rows = db.prepare(`
    SELECT id, content, position_id, difficulty FROM question_bank
    WHERE is_builtin = 1 ${positionId ? 'AND (position_id = ? OR position_id IS NULL)' : ''}
    ORDER BY id ASC
  `).all(...(positionId ? [positionId] : []));
  const hits = rows.filter((r) => wanted.includes(r.difficulty === '困难' ? 0 : 0) || true);
  const preferred = rows.filter((r) => wanted.length && r.id <= 40);
  const pool = (preferred.length ? preferred : hits).slice(0, 3);
  return pool.map((r) => ({ id: r.id, content: r.content, difficulty: r.difficulty }));
}

module.exports = (db) => async (req, res) => {
  try {
    const input = req.body || {};
    const sessionId = toNumber(input.session_id);
    if (!sessionId) return fail(res, 400, '缺少必填字段：session_id');

    const session = db.prepare('SELECT * FROM interview_sessions WHERE id = ?').get(sessionId);
    if (!session) return fail(res, 404, '会话不存在');
    if (session.user_id !== req.user.id && req.user.role !== 'admin') {
      return fail(res, 403, '无权访问该会话');
    }
    if (session.status !== 'evaluated' && session.status !== 'completed') {
      return fail(res, 400, `当前状态（${session.status}）不支持生成练习计划，请先完成评估`);
    }

    // 优先取本场技能评分；缺失时回落到报告三维度
    let dims = db.prepare('SELECT dimension, dimension_key, score FROM skill_assessments WHERE session_id = ?').all(sessionId);
    if (!dims.length) {
      const report = db.prepare('SELECT * FROM reports WHERE session_id = ? ORDER BY id DESC LIMIT 1').get(sessionId);
      if (report) {
        dims = [
          { dimension: '逻辑性', dimension_key: 'logic', score: report.logic },
          { dimension: '专业深度', dimension_key: 'depth', score: report.depth },
          { dimension: '表达力', dimension_key: 'expression', score: report.expression },
        ].filter((d) => d.score > 0);
      }
    }
    if (!dims.length) return fail(res, 400, '本场面试暂无可用于生成计划的评分数据');

    const weak = dims.filter((d) => d.score < THRESHOLD).sort((a, b) => a.score - b.score).slice(0, 3);
    const targets = weak.length ? weak : [dims.reduce((a, b) => (a.score <= b.score ? a : b))];

    const buildLocal = () => JSON.stringify({
      summary: `识别到 ${targets.length} 个待强化维度：${targets.map((t) => t.dimension).join('、')}。`,
      items: targets.map((t) => ({
        dimension: t.dimension,
        dimension_key: t.dimension_key,
        score: t.score,
        suggested_minutes: MINUTES(t.score),
        reason: `该维度得分 ${t.score} 分，低于 ${THRESHOLD} 分达标线。`,
      })),
    }, null, 2);

    const result = await ai.generate(
      [
        { role: 'system', content: '你是面试教练。根据候选人的各维度评分，为低于达标线的维度生成练习计划。用 JSON 返回：{"summary":"...","items":[{"dimension":"逻辑性","dimension_key":"logic","score":n,"suggested_minutes":n,"reason":"..."}]}。' },
        { role: 'user', content: JSON.stringify({ dims, threshold: THRESHOLD }) },
      ],
      buildLocal,
      { temperature: 0.5 },
    );

    let parsed;
    try {
      const text = String(result.text).replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    const items = Array.isArray(parsed && parsed.items) && parsed.items.length
      ? parsed.items
      : targets.map((t) => ({
        dimension: t.dimension,
        dimension_key: t.dimension_key,
        score: t.score,
        suggested_minutes: MINUTES(t.score),
        reason: `该维度得分 ${t.score} 分，低于 ${THRESHOLD} 分达标线，建议针对性强化。`,
      }));

    const report = db.prepare('SELECT id FROM reports WHERE session_id = ? ORDER BY id DESC LIMIT 1').get(sessionId);
    const ins = db.prepare(`
      INSERT INTO practice_plans (user_id,session_id,report_id,title,dimension,dimension_key,reason,target_questions,suggested_minutes,progress,status,due_date,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,0,'pending',date('now','localtime','+7 days'),datetime('now','localtime'),datetime('now','localtime'))
    `);

    const created = [];
    for (const it of items) {
      const dimKey = String(it.dimension_key || 'logic');
      const label = String(it.dimension || dimKey);
      const score = clamp(Number(it.score) || 0, 0, 100);
      const minutes = clamp(Number(it.suggested_minutes) || MINUTES(score), 15, 300);
      const qs = pickQuestions(db, dimKey, session.position_id);
      const id = ins.run(
        session.user_id, sessionId, report ? report.id : null,
        `${label}弱项强化计划`,
        label, dimKey,
        String(it.reason || `该维度得分 ${score} 分（${levelOf(score)}），建议针对性练习。`),
        JSON.stringify(qs.length ? qs.map((q) => q.content) : ['回顾本场遗漏要点并重写答案']),
        minutes,
      ).lastInsertRowid;
      created.push(db.prepare('SELECT * FROM practice_plans WHERE id = ?').get(id));
    }

    return ok(res, {
      source: result.source,
      summary: (parsed && parsed.summary) || `已生成 ${created.length} 条练习计划。`,
      plans: created.map((p) => ({ ...p, target_questions: JSON.parse(p.target_questions || '[]') })),
    }, '练习计划已写入', 201);
  } catch (e) {
    return fail(res, 500, 'AI 服务异常：' + e.message);
  }
};
