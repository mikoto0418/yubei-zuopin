// 抽出挂载函数，使 server.js 与测试共用同一套路由装配。
'use strict';
const { authRoutes, adminRoutes, crudRoutes, requireAuth, adminOnly } = require('./kernel');
const { ok, fail, toNumber } = require('./src/http');
const {
  db, SESSION_STATES, SESSION_FLOW, PLAN_STATES, PLAN_FLOW, canTransition,
} = require('./db');
const { clamp } = require('./domain/scoring');

/** 解析 JSON 数组字段，解析失败返回空数组 */
function parseArr(v) {
  try {
    const a = JSON.parse(v || '[]');
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

function levelOf(score) {
  if (score >= 85) return '优秀';
  if (score >= 70) return '良好';
  if (score >= 55) return '及格';
  return '待提升';
}

const jsonShape = (fields) => (row) => {
  const out = { ...row };
  fields.forEach((f) => { out[f] = parseArr(row[f]); });
  return out;
};

/** 所有权校验：非本人且非管理员返回 403 */
function ownOrAdmin(req, row, column = 'user_id') {
  if (!row) return { ok: false, status: 404, message: '记录不存在' };
  if (row[column] !== req.user.id && req.user.role !== 'admin') {
    return { ok: false, status: 403, message: '无权访问该记录' };
  }
  return { ok: true };
}

function mountRoutes(app, api) {
  app.use(`${api}/auth`, authRoutes({ db, extraColumns: ['target_role'] }));
  app.use(`${api}/admin`, adminRoutes({ db, buildOverview: require('./overview')(db) }));

  // ——— 岗位库（公共资源：所有登录用户可读；自建岗位归属本人）———
  app.use(`${api}/entities/positions`, requireAuth, crudRoutes({
    db, table: 'job_positions',
    fields: ['name', 'category', 'level', 'description', 'skills', 'dimensions', 'is_builtin'],
    required: ['name'],
    searchable: ['name', 'description'],
    filterable: ['category', 'level'],
    ownerColumn: null,
    numberFields: [],
    shape: jsonShape(['skills', 'dimensions']),
  }));

  // ——— 题目分类（公共字典）———
  app.use(`${api}/entities/categories`, requireAuth, crudRoutes({
    db, table: 'question_categories',
    fields: ['name', 'kind', 'description'],
    required: ['name'],
    searchable: ['name', 'description'],
    filterable: ['kind'],
    ownerColumn: null,
  }));

  // ——— 题库（内置题公共可读；自建题归属本人，只能改自己的）———
  app.get(`${api}/bank`, requireAuth, (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 12));
    const clauses = ['(q.is_builtin = 1 OR q.user_id = ?)'];
    const params = [req.user.id];
    if (req.query.position_id) { clauses.push('q.position_id = ?'); params.push(toNumber(req.query.position_id)); }
    if (req.query.category_id) { clauses.push('q.category_id = ?'); params.push(toNumber(req.query.category_id)); }
    if (req.query.difficulty) { clauses.push('q.difficulty = ?'); params.push(req.query.difficulty); }
    if (req.query.mine === '1') { clauses.push('q.user_id = ?'); params.push(req.user.id); }
    const q = (req.query.q || '').trim();
    if (q) { clauses.push('q.content LIKE ?'); params.push(`%${q}%`); }
    const where = `WHERE ${clauses.join(' AND ')}`;
    const rows = db.prepare(`
      SELECT q.*, p.name AS position_name, c.name AS category_name, c.kind AS category_kind
      FROM question_bank q
      LEFT JOIN job_positions p ON p.id = q.position_id
      LEFT JOIN question_categories c ON c.id = q.category_id
      ${where} ORDER BY q.id DESC LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page - 1) * pageSize);
    const { total } = db.prepare(`
      SELECT COUNT(*) AS total FROM question_bank q ${where}
    `).get(...params);
    return ok(res, {
      list: rows.map(jsonShape(['key_points'])),
      total, page, pageSize, pages: Math.ceil(total / pageSize) || 0,
    });
  });

  // 题库详情：内置题人人可读，自建题仅本人（管理员不受限）
  app.get(`${api}/bank/:id`, requireAuth, (req, res) => {
    const row = db.prepare(`
      SELECT q.*, p.name AS position_name, c.name AS category_name, c.kind AS category_kind
      FROM question_bank q
      LEFT JOIN job_positions p ON p.id = q.position_id
      LEFT JOIN question_categories c ON c.id = q.category_id
      WHERE q.id = ?
    `).get(toNumber(req.params.id));
    if (!row) return fail(res, 404, '题目不存在');
    if (!row.is_builtin && row.user_id !== req.user.id && req.user.role !== 'admin') {
      return fail(res, 403, '无权访问该题目');
    }
    return ok(res, jsonShape(['key_points'])(row));
  });

  // 自建题：写入 user_id 并标记 is_builtin=0
  app.post(`${api}/bank`, requireAuth, (req, res) => {
    const b = req.body || {};
    if (!String(b.content || '').trim()) return fail(res, 400, '缺少必填字段：content');
    const info = db.prepare(`
      INSERT INTO question_bank (position_id, category_id, content, reference_answer, key_points, difficulty, is_builtin, user_id)
      VALUES (?,?,?,?,?,?,0,?)
    `).run(
      b.position_id ? toNumber(b.position_id) : null,
      b.category_id ? toNumber(b.category_id) : null,
      String(b.content).trim(),
      String(b.reference_answer || ''),
      JSON.stringify(Array.isArray(b.key_points) ? b.key_points : []),
      String(b.difficulty || '中等'),
      req.user.id,
    );
    const row = db.prepare('SELECT * FROM question_bank WHERE id = ?').get(info.lastInsertRowid);
    return ok(res, jsonShape(['key_points'])(row), '题目已创建', 201);
  });

  // 自建题编辑 / 删除：仅本人或管理员
  app.put(`${api}/bank/:id`, requireAuth, (req, res) => {
    const id = toNumber(req.params.id);
    const row = db.prepare('SELECT * FROM question_bank WHERE id = ?').get(id);
    if (!row) return fail(res, 404, '题目不存在');
    if (row.is_builtin) return fail(res, 403, '内置题目不可修改，可另建自定义题');
    if (row.user_id !== req.user.id && req.user.role !== 'admin') return fail(res, 403, '无权修改该题目');
    const b = req.body || {};
    const sets = [];
    const params = [];
    const push = (col, val) => { sets.push(`${col} = ?`); params.push(val); };
    if (b.content !== undefined) push('content', String(b.content).trim());
    if (b.reference_answer !== undefined) push('reference_answer', String(b.reference_answer));
    if (b.key_points !== undefined) push('key_points', JSON.stringify(Array.isArray(b.key_points) ? b.key_points : []));
    if (b.difficulty !== undefined) push('difficulty', String(b.difficulty));
    if (b.position_id !== undefined) push('position_id', b.position_id ? toNumber(b.position_id) : null);
    if (b.category_id !== undefined) push('category_id', b.category_id ? toNumber(b.category_id) : null);
    if (!sets.length) return fail(res, 400, '没有可更新的字段');
    db.prepare(`UPDATE question_bank SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
    return ok(res, jsonShape(['key_points'])(db.prepare('SELECT * FROM question_bank WHERE id = ?').get(id)), '已保存');
  });

  app.delete(`${api}/bank/:id`, requireAuth, (req, res) => {
    const id = toNumber(req.params.id);
    const row = db.prepare('SELECT * FROM question_bank WHERE id = ?').get(id);
    if (!row) return fail(res, 404, '题目不存在');
    if (row.is_builtin) return fail(res, 403, '内置题目不可删除');
    if (row.user_id !== req.user.id && req.user.role !== 'admin') return fail(res, 403, '无权删除该题目');
    db.prepare('DELETE FROM question_bank WHERE id = ?').run(id);
    return ok(res, { id }, '已删除');
  });

  // ——— 面试会话（状态机在下方专有路由中校验）———
  app.use(`${api}/entities/sessions`, requireAuth, crudRoutes({
    db, table: 'interview_sessions',
    fields: ['title', 'position_id', 'role', 'level', 'status', 'score', 'round_count', 'started_at', 'completed_at'],
    required: ['title'],
    searchable: ['title', 'role'],
    filterable: ['status', 'level', 'position_id'],
    ownerColumn: 'user_id',
    numberFields: ['position_id', 'score', 'round_count'],
  }));

  // ——— 多轮面试轮次 ———
  app.use(`${api}/entities/rounds`, requireAuth, crudRoutes({
    db, table: 'interview_rounds',
    fields: ['session_id', 'round_no', 'question_id', 'question', 'answer', 'tech_score', 'clarity_score', 'depth_score', 'overall', 'summary', 'status'],
    required: ['session_id'],
    searchable: ['question', 'answer'],
    filterable: ['session_id', 'status'],
    ownerColumn: 'user_id',
    orderBy: 'round_no ASC',
    numberFields: ['session_id', 'round_no', 'question_id', 'tech_score', 'clarity_score', 'depth_score', 'overall'],
  }));

  // ——— 对话消息 ———
  app.use(`${api}/entities/messages`, requireAuth, crudRoutes({
    db, table: 'messages',
    fields: ['session_id', 'round_id', 'role', 'content', 'card_type'],
    required: ['session_id', 'content'],
    searchable: [],
    filterable: ['session_id', 'role'],
    ownerColumn: 'user_id',
    orderBy: 'id ASC',
    numberFields: ['session_id', 'round_id'],
  }));

  // ——— 评估报告 ———
  app.use(`${api}/entities/reports`, requireAuth, crudRoutes({
    db, table: 'reports',
    fields: ['session_id', 'overall', 'logic', 'depth', 'expression', 'summary', 'suggestions', 'source'],
    required: ['session_id'],
    searchable: [],
    filterable: ['session_id'],
    ownerColumn: 'user_id',
    numberFields: ['session_id', 'overall', 'logic', 'depth', 'expression'],
  }));

  // ——— 技能雷达评分 ———
  app.use(`${api}/entities/skills`, requireAuth, crudRoutes({
    db, table: 'skill_assessments',
    fields: ['session_id', 'report_id', 'dimension', 'dimension_key', 'score', 'level', 'comment'],
    required: ['session_id', 'dimension_key'],
    searchable: ['dimension'],
    filterable: ['session_id', 'dimension_key'],
    ownerColumn: 'user_id',
    numberFields: ['session_id', 'report_id', 'score'],
  }));

  // ——— 练习计划 ———
  app.use(`${api}/entities/plans`, requireAuth, crudRoutes({
    db, table: 'practice_plans',
    fields: ['session_id', 'report_id', 'title', 'dimension', 'dimension_key', 'reason', 'target_questions', 'suggested_minutes', 'progress', 'status', 'due_date'],
    required: ['title'],
    searchable: ['title', 'reason'],
    filterable: ['status', 'dimension_key'],
    ownerColumn: 'user_id',
    numberFields: ['session_id', 'report_id', 'suggested_minutes', 'progress'],
    shape: jsonShape(['target_questions']),
  }));

  // ——— 答案分析 ———
  app.use(`${api}/entities/analyses`, requireAuth, crudRoutes({
    db, table: 'answer_analyses',
    fields: ['session_id', 'round_id', 'question', 'answer', 'hit_points', 'missed_points', 'score', 'comment', 'source'],
    required: ['session_id'],
    searchable: ['question', 'answer'],
    filterable: ['session_id', 'round_id'],
    ownerColumn: 'user_id',
    numberFields: ['session_id', 'round_id', 'score'],
    shape: jsonShape(['hit_points', 'missed_points']),
  }));

  // ============================ 领域专有路由 ============================

  // 会话状态机流转：created → in_progress → completed → evaluated
  app.post(`${api}/sessions/:id/transition`, requireAuth, (req, res) => {
    const id = toNumber(req.params.id);
    const to = String((req.body || {}).to || '');
    const row = db.prepare('SELECT * FROM interview_sessions WHERE id = ?').get(id);
    const guard = ownOrAdmin(req, row);
    if (!guard.ok) return fail(res, guard.status, guard.message);
    if (!SESSION_STATES.includes(to)) {
      return fail(res, 400, `非法状态：${to || '(空)'}，可选 ${SESSION_STATES.join(' / ')}`);
    }
    if (!canTransition(SESSION_FLOW, row.status, to)) {
      return fail(res, 400, `不允许的状态流转：${row.status} → ${to}`);
    }
    const patch = { status: to };
    if (to === 'in_progress' && !row.started_at) patch.started_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    if (to === 'completed') patch.completed_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    db.prepare('UPDATE interview_sessions SET status = ?, started_at = ?, completed_at = ? WHERE id = ?')
      .run(patch.status, patch.started_at || row.started_at, patch.completed_at || row.completed_at, id);
    const updated = db.prepare('SELECT * FROM interview_sessions WHERE id = ?').get(id);
    return ok(res, updated, `状态已流转到 ${to}`);
  });

  // 练习计划进度：progress 驱动 status，非法流转 400
  app.put(`${api}/plans/:id/progress`, requireAuth, (req, res) => {
    const id = toNumber(req.params.id);
    const row = db.prepare('SELECT * FROM practice_plans WHERE id = ?').get(id);
    const guard = ownOrAdmin(req, row);
    if (!guard.ok) return fail(res, guard.status, guard.message);

    const progress = clamp(toNumber((req.body || {}).progress, row.progress), 0, 100);
    const want = (req.body || {}).status;
    let status = row.status;
    if (want && want !== row.status) {
      if (!PLAN_STATES.includes(want)) return fail(res, 400, `非法计划状态：${want}`);
      if (!canTransition(PLAN_FLOW, row.status, want)) {
        return fail(res, 400, `不允许的计划状态流转：${row.status} → ${want}`);
      }
      status = want;
    } else if (!want) {
      // 由进度推导状态，同样受状态机约束
      if (progress >= 100 && row.status !== 'done') {
        if (canTransition(PLAN_FLOW, row.status, 'done')) status = 'done';
      } else if (progress > 0 && row.status === 'pending') {
        status = 'in_progress';
      }
    }
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    db.prepare('UPDATE practice_plans SET progress = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(progress, status, now, id);
    return ok(res, db.prepare('SELECT * FROM practice_plans WHERE id = ?').get(id), '进度已更新');
  });

  // 技能雷达：按会话聚合，无会话时按用户全部已评估记录聚合
  app.get(`${api}/skill-radar`, requireAuth, (req, res) => {
    const sessionId = req.query.session_id ? toNumber(req.query.session_id) : null;
    const clauses = ['user_id = ?'];
    const params = [req.user.id];
    if (sessionId) { clauses.push('session_id = ?'); params.push(sessionId); }
    if (req.query.all === '1' && req.user.role === 'admin') { clauses.length = 0; params.length = 0; }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db.prepare(`
      SELECT dimension_key, dimension, AVG(score) AS avg_score, COUNT(*) AS samples, MAX(score) AS best, MIN(score) AS worst
      FROM skill_assessments ${where}
      GROUP BY dimension_key, dimension ORDER BY avg_score DESC
    `).all(...params);
    const dimensions = rows.map((r) => ({
      key: r.dimension_key,
      label: r.dimension,
      score: Math.round(r.avg_score),
      level: levelOf(Math.round(r.avg_score)),
      samples: r.samples,
      best: r.best,
      worst: r.worst,
    }));
    const average = dimensions.length
      ? Math.round(dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length)
      : 0;
    return ok(res, {
      session_id: sessionId,
      average,
      level: levelOf(average),
      dimensions,
      weakest: dimensions.length ? [...dimensions].sort((a, b) => a.score - b.score)[0] : null,
      strongest: dimensions.length ? [...dimensions].sort((a, b) => b.score - a.score)[0] : null,
    });
  });

  // 面试详情：会话 + 轮次 + 每轮答案分析 + 报告 + 技能评分 + 练习计划
  app.get(`${api}/sessions/:id/detail`, requireAuth, (req, res) => {
    const id = toNumber(req.params.id);
    const session = db.prepare('SELECT * FROM interview_sessions WHERE id = ?').get(id);
    const guard = ownOrAdmin(req, session);
    if (!guard.ok) return fail(res, guard.status, guard.message);
    const rounds = db.prepare('SELECT * FROM interview_rounds WHERE session_id = ? ORDER BY round_no ASC').all(id);
    const analyses = db.prepare('SELECT * FROM answer_analyses WHERE session_id = ? ORDER BY id ASC').all(id)
      .map(jsonShape(['hit_points', 'missed_points']));
    const report = db.prepare('SELECT * FROM reports WHERE session_id = ? ORDER BY id DESC LIMIT 1').get(id) || null;
    const skills = db.prepare('SELECT * FROM skill_assessments WHERE session_id = ? ORDER BY id ASC').all(id);
    const plans = db.prepare('SELECT * FROM practice_plans WHERE session_id = ? ORDER BY id ASC').all(id)
      .map(jsonShape(['target_questions']));
    const analysisByRound = {};
    analyses.forEach((a) => { if (a.round_id) analysisByRound[a.round_id] = a; });
    return ok(res, {
      session,
      rounds: rounds.map((r) => ({ ...r, analysis: analysisByRound[r.id] || null })),
      report,
      skills,
      plans,
    });
  });

  // 生成报告 + 技能评分落库（评分写入 skill_assessments，供雷达与练习计划消费）
  app.post(`${api}/reports/:sessionId/skills`, requireAuth, (req, res) => {
    const sessionId = toNumber(req.params.sessionId);
    const session = db.prepare('SELECT * FROM interview_sessions WHERE id = ?').get(sessionId);
    const guard = ownOrAdmin(req, session);
    if (!guard.ok) return fail(res, guard.status, guard.message);

    const report = db.prepare('SELECT * FROM reports WHERE session_id = ? ORDER BY id DESC LIMIT 1').get(sessionId);
    if (!report) return fail(res, 400, '请先生成本场面试的评估报告');

    const rounds = db.prepare('SELECT * FROM interview_rounds WHERE session_id = ? ORDER BY round_no ASC').all(sessionId);
    const avg = (key) => (rounds.length ? Math.round(rounds.reduce((s, r) => s + (r[key] || 0), 0) / rounds.length) : 0);

    const dims = [
      { key: 'logic', label: '逻辑性', score: report.logic || avg('overall'), comment: '按「结论—论据」组织回答的能力。' },
      { key: 'depth', label: '专业深度', score: report.depth || avg('depth_score'), comment: '技术原理与边界条件的展开程度。' },
      { key: 'expression', label: '表达力', score: report.expression || avg('clarity_score'), comment: '信息密度、语速与条理性。' },
      { key: 'tech', label: '技术准确度', score: avg('tech_score') || report.overall, comment: '答案要点命中率与准确程度。' },
      { key: 'engineering', label: '工程实践', score: Math.max(0, (report.overall || 0) - 3), comment: '真实项目落地与取舍经验。' },
    ].filter((d) => d.score > 0);

    if (!dims.length) return fail(res, 400, '本场面试暂无可用于评分的轮次或报告数据');

    db.prepare('DELETE FROM skill_assessments WHERE session_id = ?').run(sessionId);
    const ins = db.prepare(
      'INSERT INTO skill_assessments (user_id,session_id,report_id,dimension,dimension_key,score,level,comment) VALUES (?,?,?,?,?,?,?,?)',
    );
    dims.forEach((d) => ins.run(session.user_id, sessionId, report.id, d.label, d.key, clamp(d.score, 0, 100), levelOf(d.score), d.comment));

    return ok(res, db.prepare('SELECT * FROM skill_assessments WHERE session_id = ? ORDER BY id ASC').all(sessionId), '技能评分已写入', 201);
  });

  // AI：出题 / 评估 / 答案分析（落库）/ 练习计划（落库）
  app.post(`${api}/ai/ask`, requireAuth, require('./ai/ask')(db));
  app.post(`${api}/ai/evaluate`, requireAuth, require('./ai/evaluate')(db));
  app.post(`${api}/ai/analyze-answer`, requireAuth, require('./ai/analyze-answer')(db));
  app.post(`${api}/ai/practice-plan`, requireAuth, require('./ai/practice-plan')(db));

  // 管理端：题库/岗位统计之外的领域汇总由 overview 提供
  app.get(`${api}/admin/domain-stats`, requireAuth, adminOnly, (req, res) => {
    const one = (sql) => { try { return db.prepare(sql).get().c; } catch { return 0; } };
    return ok(res, {
      positions: one('SELECT COUNT(*) AS c FROM job_positions'),
      questions: one('SELECT COUNT(*) AS c FROM question_bank'),
      rounds: one('SELECT COUNT(*) AS c FROM interview_rounds'),
      analyses: one('SELECT COUNT(*) AS c FROM answer_analyses'),
      plans: one('SELECT COUNT(*) AS c FROM practice_plans'),
      skills: one('SELECT COUNT(*) AS c FROM skill_assessments'),
      by_status: db.prepare('SELECT status, COUNT(*) AS c FROM interview_sessions GROUP BY status').all(),
    });
  });
}

module.exports = { mountRoutes, levelOf };
