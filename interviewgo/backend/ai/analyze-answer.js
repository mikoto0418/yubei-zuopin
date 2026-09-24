// AI 答案要点分析：命中 / 遗漏要点，并写入 answer_analyses 与 interview_rounds。
'use strict';
const { ok, fail, toNumber } = require('../src/http');
const ai = require('../src/ai');
const { pickKeyPoints, scoreAnswer } = require('../domain/scoring');

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

    const questionId = input.question_id ? toNumber(input.question_id) : null;
    const question = String(input.question || '').trim();
    const answer = String(input.answer || '').trim();
    if (!question || !answer) return fail(res, 400, '缺少必填字段：question、answer');

    const points = pickKeyPoints(db, questionId);
    const roundNo = input.round_no ? toNumber(input.round_no) : (db.prepare('SELECT COUNT(*) AS c FROM interview_rounds WHERE session_id = ?').get(sessionId).c + 1);

    const local = scoreAnswer({ points, answer, index: roundNo - 1 });
    const buildLocal = () => JSON.stringify({
      hit: local.hit, missed: local.missed, score: local.overall,
      comment: local.summary,
    }, null, 2);

    const result = await ai.generate(
      [
        { role: 'system', content: '你是面试答案分析专家。给定问题、候选人回答与参考要点，判断哪些要点被命中、哪些被遗漏，并给出 0-100 的总体评分与一句具体点评。用 JSON 返回：{"hit":["..."],"missed":["..."],"score":n,"comment":"..."}。' },
        { role: 'user', content: JSON.stringify({ question, answer, points }) },
      ],
      buildLocal,
      { temperature: 0.4 },
    );

    let parsed;
    try {
      const text = String(result.text).replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      parsed = JSON.parse(text);
    } catch {
      parsed = { hit: local.hit, missed: local.missed, score: local.overall, comment: local.summary };
    }
    const hit = Array.isArray(parsed.hit) ? parsed.hit.map(String) : local.hit;
    const missed = Array.isArray(parsed.missed) ? parsed.missed.map(String) : local.missed;
    const score = Math.max(0, Math.min(100, Number(parsed.score) || local.overall));
    const comment = String(parsed.comment || local.summary);

    // 轮次：同一会话同一轮号则更新，否则新增
    const existing = db.prepare('SELECT * FROM interview_rounds WHERE session_id = ? AND round_no = ?').get(sessionId, roundNo);
    const summary = `要点命中 ${hit.length}/${hit.length + missed.length}：${comment}`;
    let roundId;
    if (existing) {
      db.prepare(`UPDATE interview_rounds SET question_id = ?, question = ?, answer = ?, tech_score = ?, clarity_score = ?, depth_score = ?, overall = ?, summary = ?, status = 'scored' WHERE id = ?`)
        .run(questionId, question, answer, local.tech, local.clarity, local.depth, score, summary, existing.id);
      roundId = existing.id;
    } else {
      roundId = db.prepare(
        'INSERT INTO interview_rounds (user_id,session_id,round_no,question_id,question,answer,tech_score,clarity_score,depth_score,overall,summary,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      ).run(session.user_id, sessionId, roundNo, questionId, question, answer, local.tech, local.clarity, local.depth, score, summary, 'scored').lastInsertRowid;
    }

    const analysisId = db.prepare(
      'INSERT INTO answer_analyses (user_id,session_id,round_id,question,answer,hit_points,missed_points,score,comment,source) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(
      session.user_id, sessionId, roundId, question, answer,
      JSON.stringify(hit), JSON.stringify(missed), score, comment, result.source,
    ).lastInsertRowid;

    // 会话轮次计数与状态：首次分析即从 created 进入 in_progress
    const roundCount = db.prepare('SELECT COUNT(*) AS c FROM interview_rounds WHERE session_id = ?').get(sessionId).c;
    if (session.status === 'created') {
      db.prepare("UPDATE interview_sessions SET status = 'in_progress', started_at = COALESCE(started_at, datetime('now','localtime')), round_count = ? WHERE id = ?")
        .run(roundCount, sessionId);
    } else {
      db.prepare('UPDATE interview_sessions SET round_count = ? WHERE id = ?').run(roundCount, sessionId);
    }

    const analysis = db.prepare('SELECT * FROM answer_analyses WHERE id = ?').get(analysisId);
    return ok(res, {
      source: result.source,
      analysis: {
        ...analysis,
        hit_points: hit,
        missed_points: missed,
      },
      round: db.prepare('SELECT * FROM interview_rounds WHERE id = ?').get(roundId),
    }, '答案分析已写入', 201);
  } catch (e) {
    return fail(res, 500, 'AI 服务异常：' + e.message);
  }
};
