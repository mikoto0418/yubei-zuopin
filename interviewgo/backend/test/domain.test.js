// InterviewGo 领域测试：状态机非法流转 / 越权 / 技能雷达 / 练习计划 / 分页 / AI 降级。
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

// 测试库独立，避免污染开发数据
const TEST_DB = path.join(__dirname, '..', 'data', 'interviewgo.test.db');
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-domain';

for (const f of [TEST_DB, `${TEST_DB}-shm`, `${TEST_DB}-wal`]) {
  try { fs.unlinkSync(f); } catch { /* 不存在则忽略 */ }
}

const { createApp } = require('../kernel').server;
const { mountRoutes } = require('../routes');
const { db, SESSION_FLOW, PLAN_FLOW, canTransition } = require('../db');

let server;
let base;

before(() => {
  const app = createApp({ mountRoutes });
  server = app.listen(5299);
  base = 'http://127.0.0.1:5299';
});

after(() => {
  if (server) server.close();
  try { db.close(); } catch { /* 忽略 */ }
});

async function call(method, p, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* 非 JSON 忽略 */ }
  return { status: res.status, json };
}

async function login(username, password) {
  const { json } = await call('POST', '/api/auth/login', { username, password });
  return json.data.token;
}

const uniq = () => 'u' + Date.now() + Math.floor(Math.random() * 10000);

// —— 表结构 ——
test('数据库包含 11 张业务表', () => {
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  const expected = [
    'users', 'job_positions', 'question_categories', 'question_bank', 'interview_sessions',
    'interview_rounds', 'messages', 'reports', 'skill_assessments', 'practice_plans', 'answer_analyses',
  ];
  expected.forEach((t) => assert.ok(names.includes(t), `缺少表 ${t}`));
  assert.strictEqual(expected.length, 11);
});

// —— 种子厚度 ——
test('种子数据满足厚度要求', () => {
  const count = (t) => db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
  assert.ok(count('users') >= 3, '至少 3 个账号');
  assert.ok(count('job_positions') >= 6, '至少 6 个岗位');
  assert.ok(count('question_categories') >= 12, '至少 12 个题目分类');
  assert.ok(count('question_bank') >= 40, '至少 40 道题');
  assert.ok(count('interview_sessions') >= 8, '至少 8 场会话');
  assert.ok(count('interview_rounds') >= 10, '轮次记录存在');
  assert.ok(count('answer_analyses') >= 10, '答案分析存在');
  assert.ok(count('skill_assessments') >= 8, '技能评分存在');
  assert.ok(count('practice_plans') >= 3, '练习计划存在');
});

test('种子数据跨不少于 7 个日期', () => {
  const rows = db.prepare("SELECT DISTINCT substr(created_at,1,10) AS d FROM interview_sessions").all();
  assert.ok(rows.length >= 7, `会话跨 ${rows.length} 个日期，要求 ≥ 7`);
});

test('四种会话状态在种子中都有样本', () => {
  const rows = db.prepare('SELECT DISTINCT status FROM interview_sessions').all().map((r) => r.status);
  ['created', 'in_progress', 'completed', 'evaluated'].forEach((s) => {
    assert.ok(rows.includes(s), `缺少状态样本 ${s}`);
  });
});

// —— 状态机 ——
test('状态机定义：非法流转被拒绝', () => {
  assert.strictEqual(canTransition(SESSION_FLOW, 'created', 'completed'), false);
  assert.strictEqual(canTransition(SESSION_FLOW, 'evaluated', 'in_progress'), false);
  assert.strictEqual(canTransition(SESSION_FLOW, 'created', 'in_progress'), true);
  assert.strictEqual(canTransition(SESSION_FLOW, 'in_progress', 'completed'), true);
  assert.strictEqual(canTransition(SESSION_FLOW, 'completed', 'evaluated'), true);
});

test('接口：非法状态流转返回 400', async () => {
  const token = await login('candidate', 'candidate123');
  const created = await call('POST', '/api/entities/sessions', { title: '状态机测试会话', role: '前端工程师', level: '中级' }, token);
  const id = created.json.data.id;
  assert.strictEqual(created.json.data.status, 'created');

  // created → completed 非法
  const bad = await call('POST', `/api/sessions/${id}/transition`, { to: 'completed' }, token);
  assert.strictEqual(bad.status, 400, 'created → completed 应返回 400');

  // 不存在的状态值非法
  const bogus = await call('POST', `/api/sessions/${id}/transition`, { to: 'archived' }, token);
  assert.strictEqual(bogus.status, 400);

  // 合法流转链
  const s1 = await call('POST', `/api/sessions/${id}/transition`, { to: 'in_progress' }, token);
  assert.strictEqual(s1.status, 200);
  const s2 = await call('POST', `/api/sessions/${id}/transition`, { to: 'completed' }, token);
  assert.strictEqual(s2.status, 200);
  const s3 = await call('POST', `/api/sessions/${id}/transition`, { to: 'evaluated' }, token);
  assert.strictEqual(s3.status, 200);

  // 终态后继续流转非法
  const after = await call('POST', `/api/sessions/${id}/transition`, { to: 'in_progress' }, token);
  assert.strictEqual(after.status, 400, 'evaluated 为终态');
});

test('练习计划状态机：pending → in_progress → done，跳级被拒', async () => {
  const token = await login('candidate', 'candidate123');
  const created = await call('POST', '/api/entities/plans', { title: '测试计划', dimension: '逻辑性', dimension_key: 'logic', suggested_minutes: 60 }, token);
  const id = created.json.data.id;

  const skip = await call('PUT', `/api/plans/${id}/progress`, { status: 'done' }, token);
  assert.strictEqual(skip.status, 400, 'pending → done 应被拒绝');

  const start = await call('PUT', `/api/plans/${id}/progress`, { status: 'in_progress', progress: 20 }, token);
  assert.strictEqual(start.status, 200);
  assert.strictEqual(start.json.data.status, 'in_progress');

  const finish = await call('PUT', `/api/plans/${id}/progress`, { progress: 100 }, token);
  assert.strictEqual(finish.status, 200);
  assert.strictEqual(finish.json.data.status, 'done', 'progress 100 应推导为 done');

  assert.strictEqual(canTransition(PLAN_FLOW, 'pending', 'done'), false);
});

// —— 越权 ——
test('越权：访问他人会话详情返回 403', async () => {
  const tokenA = await login('candidate', 'candidate123');
  const tokenB = await login('jobseeker', 'jobseeker123');
  const created = await call('POST', '/api/entities/sessions', { title: '越权测试会话' }, tokenA);
  const id = created.json.data.id;

  const detail = await call('GET', `/api/sessions/${id}/detail`, null, tokenB);
  assert.strictEqual(detail.status, 403, '他人会话详情应 403');

  const transition = await call('POST', `/api/sessions/${id}/transition`, { to: 'in_progress' }, tokenB);
  assert.strictEqual(transition.status, 403, '他人会话状态流转应 403');

  const plans = await call('POST', '/api/ai/practice-plan', { session_id: id }, tokenB);
  assert.strictEqual(plans.status, 403, '他人会话生成计划应 403');

  const analyze = await call('POST', '/api/ai/analyze-answer', { session_id: id, question: 'q', answer: 'a' }, tokenB);
  assert.strictEqual(analyze.status, 403, '他人会话答案分析应 403');
});

test('越权：自建题仅本人可改删', async () => {
  const tokenA = await login('candidate', 'candidate123');
  const tokenB = await login('jobseeker', 'jobseeker123');
  const created = await call('POST', '/api/bank', { content: '越权测试题：请说明闭包。', key_points: ['闭包'] }, tokenA);
  const id = created.json.data.id;

  const edit = await call('PUT', `/api/bank/${id}`, { content: '被篡改' }, tokenB);
  assert.strictEqual(edit.status, 403);

  const del = await call('DELETE', `/api/bank/${id}`, null, tokenB);
  assert.strictEqual(del.status, 403);

  // 内置题任何人不可改
  const builtin = db.prepare('SELECT id FROM question_bank WHERE is_builtin = 1 LIMIT 1').get();
  const editBuiltin = await call('PUT', `/api/bank/${builtin.id}`, { content: 'x' }, tokenA);
  assert.strictEqual(editBuiltin.status, 403, '内置题不可修改');
});

test('越权：普通用户访问领域统计返回 403', async () => {
  const token = await login('candidate', 'candidate123');
  const { status } = await call('GET', '/api/admin/domain-stats', null, token);
  assert.strictEqual(status, 403);
});

// —— 技能雷达 ——
test('技能评分写入后雷达可按维度聚合', async () => {
  const token = await login('candidate', 'candidate123');
  const created = await call('POST', '/api/entities/sessions', { title: '雷达聚合测试', role: '前端工程师', level: '中级' }, token);
  const id = created.json.data.id;

  await call('POST', `/api/sessions/${id}/transition`, { to: 'in_progress' }, token);
  await call('POST', `/api/sessions/${id}/transition`, { to: 'completed' }, token);
  await call('POST', '/api/entities/reports', { session_id: id, overall: 76, logic: 80, depth: 68, expression: 74 }, token);

  const written = await call('POST', `/api/reports/${id}/skills`, {}, token);
  assert.strictEqual(written.status, 201);
  assert.ok(written.json.data.length >= 3, '应写入至少 3 个维度');

  const radar = await call('GET', `/api/skill-radar?session_id=${id}`, null, token);
  assert.strictEqual(radar.status, 200);
  assert.ok(radar.json.data.dimensions.length >= 3);
  assert.ok(radar.json.data.average > 0);
  assert.ok(radar.json.data.weakest && radar.json.data.strongest, '应给出最弱与最强维度');

  // 无报告时写入应被拒绝（400）
  const empty = await call('POST', '/api/entities/sessions', { title: '无报告会话' }, token);
  const bad = await call('POST', `/api/reports/${empty.json.data.id}/skills`, {}, token);
  assert.strictEqual(bad.status, 400);
});

// —— 答案分析落库 ——
test('答案分析写入 answer_analyses 与 interview_rounds，并推进会话状态', async () => {
  const token = await login('candidate', 'candidate123');
  const created = await call('POST', '/api/entities/sessions', { title: '答案分析测试', role: '前端工程师', level: '初级' }, token);
  const id = created.json.data.id;
  const q = db.prepare('SELECT id, content, key_points FROM question_bank WHERE is_builtin = 1 ORDER BY id ASC LIMIT 1').get();
  const points = JSON.parse(q.key_points);

  const { status, json } = await call('POST', '/api/ai/analyze-answer', {
    session_id: id,
    question_id: q.id,
    question: q.content,
    answer: `我认为${points[0]}是关键，同时${points[1]}也很重要。`,
  }, token);

  assert.strictEqual(status, 201);
  assert.ok(json.data.analysis.id, '应返回落库后的分析记录');
  assert.ok(Array.isArray(json.data.analysis.hit_points));
  assert.ok(json.data.analysis.hit_points.length >= 1, '至少命中一个要点');
  assert.ok(json.data.analysis.missed_points.length >= 1, '应记录遗漏要点');
  assert.ok(['llm', 'local'].includes(json.data.source), 'source 必须是 llm 或 local');
  assert.strictEqual(json.data.round.round_no, 1);

  const session = db.prepare('SELECT * FROM interview_sessions WHERE id = ?').get(id);
  assert.strictEqual(session.status, 'in_progress', '首次分析应把 created 推进到 in_progress');
  assert.strictEqual(session.round_count, 1);

  // 同一轮号重复分析应更新而非新增轮次
  await call('POST', '/api/ai/analyze-answer', { session_id: id, question: q.content, answer: '补充回答', round_no: 1 }, token);
  const rounds = db.prepare('SELECT COUNT(*) AS c FROM interview_rounds WHERE session_id = ?').get(id).c;
  assert.strictEqual(rounds, 1, '同轮号应更新，不新增');
});

// —— 练习计划生成 ——
test('练习计划由低分维度自动生成并落库', async () => {
  const token = await login('candidate', 'candidate123');
  const created = await call('POST', '/api/entities/sessions', { title: '计划生成测试', role: '前端工程师', level: '中级' }, token);
  const id = created.json.data.id;

  // 未完成评估时拒绝生成
  const early = await call('POST', '/api/ai/practice-plan', { session_id: id }, token);
  assert.strictEqual(early.status, 400);

  await call('POST', `/api/sessions/${id}/transition`, { to: 'in_progress' }, token);
  await call('POST', `/api/sessions/${id}/transition`, { to: 'completed' }, token);
  await call('POST', `/api/sessions/${id}/transition`, { to: 'evaluated' }, token);
  await call('POST', '/api/entities/reports', { session_id: id, overall: 64, logic: 78, depth: 52, expression: 62 }, token);
  await call('POST', `/api/reports/${id}/skills`, {}, token);

  const { status, json } = await call('POST', '/api/ai/practice-plan', { session_id: id }, token);
  assert.strictEqual(status, 201);
  assert.ok(json.data.plans.length >= 1, '应生成至少 1 条计划');
  const plan = json.data.plans[0];
  assert.ok(plan.title && plan.dimension_key, '计划应带标题与维度');
  assert.ok(plan.suggested_minutes >= 15, '应有建议时长');
  assert.ok(Array.isArray(plan.target_questions) && plan.target_questions.length >= 1, '应有推荐题目');
  assert.strictEqual(plan.status, 'pending');
  assert.ok(['llm', 'local'].includes(json.data.source));

  // 落库校验
  const rows = db.prepare('SELECT COUNT(*) AS c FROM practice_plans WHERE session_id = ?').get(id).c;
  assert.strictEqual(rows, json.data.plans.length);
});

// —— 分页与筛选 ——
test('题库分页与筛选生效', async () => {
  const token = await login('candidate', 'candidate123');

  const p1 = await call('GET', '/api/bank?page=1&pageSize=5', null, token);
  assert.strictEqual(p1.status, 200);
  assert.strictEqual(p1.json.data.list.length, 5);
  assert.ok(p1.json.data.total >= 40, '题库总数应 ≥ 40');
  assert.ok(p1.json.data.pages >= 8);

  const p2 = await call('GET', '/api/bank?page=2&pageSize=5', null, token);
  const ids1 = p1.json.data.list.map((r) => r.id);
  const ids2 = p2.json.data.list.map((r) => r.id);
  assert.ok(ids1.every((x) => !ids2.includes(x)), '不同页数据不重复');

  // 越界页返回空列表而非报错
  const overflow = await call('GET', '/api/bank?page=999&pageSize=10', null, token);
  assert.strictEqual(overflow.status, 200);
  assert.strictEqual(overflow.json.data.list.length, 0);

  const filtered = await call('GET', '/api/bank?difficulty=困难&pageSize=100', null, token);
  assert.strictEqual(filtered.status, 200);
  assert.ok(filtered.json.data.list.every((r) => r.difficulty === '困难'), '难度筛选应生效');

  const searched = await call('GET', `/api/bank?q=${encodeURIComponent('索引')}&pageSize=100`, null, token);
  assert.ok(searched.json.data.total >= 1, '关键词搜索应有命中');
});

test('岗位与分类支持搜索与筛选', async () => {
  const token = await login('candidate', 'candidate123');
  const all = await call('GET', '/api/entities/positions?pageSize=100', null, token);
  assert.ok(all.json.data.total >= 6);
  assert.ok(Array.isArray(all.json.data.list[0].skills), 'skills 应被解析为数组');

  const tech = await call('GET', '/api/entities/positions?category=技术&pageSize=100', null, token);
  assert.ok(tech.json.data.list.every((p) => p.category === '技术'));

  const cats = await call('GET', '/api/entities/categories?kind=行为&pageSize=100', null, token);
  assert.ok(cats.json.data.list.every((c) => c.kind === '行为'));
});

// —— AI 降级 ——
test('AI 降级：未配置 Key 时返回 local 且可用', async () => {
  const token = await login('candidate', 'candidate123');
  delete process.env.LLM_API_KEY;

  const ask = await call('POST', '/api/ai/ask', { role: '前端工程师', level: '中级', round: 1 }, token);
  assert.strictEqual(ask.status, 200);
  assert.strictEqual(ask.json.data.source, 'local');
  assert.ok(ask.json.data.text.length > 0, '降级也应返回题目');

  const evaluate = await call('POST', '/api/ai/evaluate', { messages: [{ role: 'user', content: '这是一段回答内容，用于测试降级评分。' }] }, token);
  assert.strictEqual(evaluate.status, 200);
  assert.strictEqual(evaluate.json.data.source, 'local');
  const parsed = JSON.parse(evaluate.json.data.text);
  assert.ok(parsed.overall > 0 && parsed.summary, '降级报告应结构完整');
});

test('AI 出题：带岗位时从题库抽题并回传要点', async () => {
  const token = await login('candidate', 'candidate123');
  const pos = db.prepare('SELECT id, name FROM job_positions ORDER BY id ASC LIMIT 1').get();
  const { status, json } = await call('POST', '/api/ai/ask', { role: pos.name, level: '中级', round: 1, position_id: pos.id }, token);
  assert.strictEqual(status, 200);
  assert.ok(json.data.question_id, '应回传命中的题目 id');
  assert.ok(Array.isArray(json.data.key_points) && json.data.key_points.length >= 1);
});

// —— 权限与鉴权 ——
test('未登录访问领域接口返回 401', async () => {
  for (const p of ['/api/bank', '/api/skill-radar', '/api/entities/positions', '/api/admin/domain-stats']) {
    const { status } = await call('GET', p);
    assert.strictEqual(status, 401, `${p} 应要求登录`);
  }
});

test('管理员可读领域统计', async () => {
  const token = await login('admin', 'admin123');
  const { status, json } = await call('GET', '/api/admin/domain-stats', null, token);
  assert.strictEqual(status, 200);
  assert.ok(json.data.positions >= 6);
  assert.ok(Array.isArray(json.data.by_status));
});

test('管理员概览包含领域指标', async () => {
  const token = await login('admin', 'admin123');
  const { status, json } = await call('GET', '/api/admin/overview', null, token);
  assert.strictEqual(status, 200);
  ['positions_total', 'questions_total', 'rounds_total', 'skills_total', 'plans_total', 'analyses_total'].forEach((k) => {
    assert.strictEqual(typeof json.data[k], 'number', `概览缺少 ${k}`);
  });
});

test('会话详情返回轮次、答案分析与练习计划', async () => {
  const token = await login('candidate', 'candidate123');
  const row = db.prepare("SELECT id FROM interview_sessions WHERE status = 'evaluated' AND user_id = (SELECT id FROM users WHERE username='candidate') ORDER BY id ASC LIMIT 1").get();
  const { status, json } = await call('GET', `/api/sessions/${row.id}/detail`, null, token);
  assert.strictEqual(status, 200);
  assert.ok(Array.isArray(json.data.rounds) && json.data.rounds.length >= 1);
  assert.ok(json.data.report, '应带评估报告');
  assert.ok(Array.isArray(json.data.skills) && json.data.skills.length >= 3);
  assert.ok(Array.isArray(json.data.plans));
  const withAnalysis = json.data.rounds.filter((r) => r.analysis);
  assert.ok(withAnalysis.length >= 1, '至少一轮带答案分析');
  assert.ok(Array.isArray(withAnalysis[0].analysis.hit_points));
});

test('会话详情 404 与非法 ID 处理正确', async () => {
  const token = await login('candidate', 'candidate123');
  const notFound = await call('GET', '/api/sessions/999999/detail', null, token);
  assert.strictEqual(notFound.status, 404);
});
