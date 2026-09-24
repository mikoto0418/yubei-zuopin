// 核心链路接口测试（node:test + 原生 fetch，无测试框架依赖）
// 运行：cd backend && npm test
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');

// ---- 使用独立临时数据库，避免污染真实 examprep.db ----
const tmpDb = path.join(os.tmpdir(), `examprep-test-${Date.now()}.db`);
process.env.EXAMPREP_DB = tmpDb;
process.env.SECRET_KEY = 'test-secret-key-please-ignore';
process.env.PORT = '0';
// 强制走 AI 本地降级分支：置空 key。dotenv.config() 默认不覆盖已存在的环境变量，
// 因此这里显式写空串即可让 callLLM 直接返回 null，不触达云端。
process.env.LLM_API_KEY = '';

const { db, seedIfNeeded, dayOffset } = require('../db');
const app = require('../server');

let server;
let base;

before(async () => {
  seedIfNeeded();
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  for (const f of [tmpDb, `${tmpDb}-shm`, `${tmpDb}-wal`]) {
    fs.rmSync(f, { force: true });
  }
});

// ---- 请求辅助 ----
async function req(method, url, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const resp = await fetch(base + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data = {};
  try { data = await resp.json(); } catch {}
  return { status: resp.status, data };
}

async function login(username, password) {
  return (await req('POST', '/api/auth/login', { body: { username, password } })).data.token;
}

// ================= 账号与权限 =================
describe('账号 & 权限', () => {
  test('健康检查', async () => {
    const r = await req('GET', '/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.data.ok, true);
  });

  test('注册 新用户 -> 201 并返回 token（默认 student 角色）', async () => {
    const r = await req('POST', '/api/auth/register', {
      body: { username: 'alpha', password: '123456', target_exam: '考研', exam_date: '2026-12-20' },
    });
    assert.equal(r.status, 201);
    assert.ok(r.data.token);
    assert.equal(r.data.user.role, 'student');
  });

  test('注册：密码不足 6 位 -> 400 中文提示', async () => {
    const r = await req('POST', '/api/auth/register', { body: { username: 'beta', password: '123' } });
    assert.equal(r.status, 400);
    assert.match(r.data.message, /密码/);
  });

  test('注册：用户名重复 -> 409', async () => {
    const r = await req('POST', '/api/auth/register', { body: { username: 'admin', password: '123456' } });
    assert.equal(r.status, 409);
  });

  test('登录 demo 成功', async () => {
    const r = await req('POST', '/api/auth/login', { body: { username: 'demo', password: 'demo123' } });
    assert.equal(r.status, 200);
    assert.ok(r.data.token);
    assert.equal(r.data.user.role, 'student');
  });

  test('登录 student1（mentor 角色）成功', async () => {
    const r = await req('POST', '/api/auth/login', { body: { username: 'student1', password: 'student123' } });
    assert.equal(r.status, 200);
    assert.equal(r.data.user.role, 'mentor');
  });

  test('登录失败 -> 401', async () => {
    const r = await req('POST', '/api/auth/login', { body: { username: 'demo', password: 'wrong' } });
    assert.equal(r.status, 401);
  });

  test('学员访问 /api/admin -> 403（越权）', async () => {
    const token = await login('demo', 'demo123');
    const r = await req('GET', '/api/admin/dashboard', { token });
    assert.equal(r.status, 403);
  });

  test('助教(mentor) 可访问 /api/admin/dashboard -> 200', async () => {
    const token = await login('student1', 'student123');
    const r = await req('GET', '/api/admin/dashboard', { token });
    assert.equal(r.status, 200);
    assert.ok(r.data.dashboard.users >= 3);
  });

  test('未登录访问受保护接口 -> 401', async () => {
    const r = await req('GET', '/api/goals');
    assert.equal(r.status, 401);
  });

  test('不存在的接口 -> 404', async () => {
    const r = await req('GET', '/api/no-such-route');
    assert.equal(r.status, 404);
  });
});

// ================= 目标 CRUD =================
describe('目标管理', () => {
  test('新增 / 列表 / 详情 / 更新 / 删除', async () => {
    const token = await login('demo', 'demo123');
    const created = await req('POST', '/api/goals', {
      token, body: { subject: '专业课', target: 120, weight: 2, progress: 40 },
    });
    assert.equal(created.status, 201);
    const gid = created.data.goal.id;

    const list = await req('GET', '/api/goals', { token });
    const found = list.data.goals.find((g) => g.id === gid);
    assert.ok(found);

    const detail = await req('GET', `/api/goals/${gid}`, { token });
    assert.equal(detail.data.goal.subject, '专业课');

    const upd = await req('PUT', `/api/goals/${gid}`, { token, body: { progress: 60 } });
    assert.equal(upd.data.goal.progress, 60);

    const del = await req('DELETE', `/api/goals/${gid}`, { token });
    assert.equal(del.status, 200);
    const afterDel = await req('GET', `/api/goals/${gid}`, { token });
    assert.equal(afterDel.status, 404);
  });

  test('新增：目标分非法 -> 400', async () => {
    const token = await login('demo', 'demo123');
    const r = await req('POST', '/api/goals', { token, body: { subject: '数学', target: 0 } });
    assert.equal(r.status, 400);
  });

  test('目标列表支持分页', async () => {
    const token = await login('demo', 'demo123');
    const r = await req('GET', '/api/goals?page=1&pageSize=2', { token });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data.goals));
    assert.equal(typeof r.data.total, 'number');
    assert.ok(r.data.goals.length <= 2);
  });
});

// ================= 每日计划 CRUD =================
describe('每日计划', () => {
  test('新增 / 勾选完成 / 修改 / 删除', async () => {
    const token = await login('demo', 'demo123');
    const created = await req('POST', '/api/plans', {
      token, body: { subject: '数学', content: '测试计划任务', exam_hours: 2 },
    });
    assert.equal(created.status, 201);
    const pid = created.data.plan.id;

    const today = await req('GET', '/api/plans/today', { token });
    assert.ok(today.data.plans.some((p) => p.id === pid));

    const done = await req('PUT', `/api/plans/${pid}`, { token, body: { done: true } });
    assert.equal(done.data.plan.done, 1);

    const edit = await req('PUT', `/api/plans/${pid}`, { token, body: { content: '改过的内容' } });
    assert.equal(edit.data.plan.content, '改过的内容');

    const del = await req('DELETE', `/api/plans/${pid}`, { token });
    assert.equal(del.status, 200);
  });

  test('新增计划：缺少内容 -> 400', async () => {
    const token = await login('demo', 'demo123');
    const r = await req('POST', '/api/plans', { token, body: { subject: '英语' } });
    assert.equal(r.status, 400);
  });
});

// ================= 时间块日历 + 状态机 =================
describe('时间块日历（状态机 planned → in_progress → done / skipped）', () => {
  test('日历视图返回今日时间块与分钟数', async () => {
    const token = await login('demo', 'demo123');
    const r = await req('GET', `/api/blocks/calendar?date=${dayOffset(0)}&days=1`, { token });
    assert.equal(r.status, 200);
    assert.equal(r.data.days.length, 1);
    assert.ok(Array.isArray(r.data.days[0].blocks));
    assert.equal(typeof r.data.days[0].minutes, 'number');
  });

  test('新建时间块：30 分钟粒度 + 重叠校验', async () => {
    const token = await login('demo', 'demo123');
    const ok = await req('POST', '/api/blocks', {
      token,
      body: { subject: '数学', title: '清晨限时训练', block_date: dayOffset(0), start_time: '06:00', end_time: '06:30' },
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.data.block.status, 'planned');

    // 与上一条重叠 -> 400
    const clash = await req('POST', '/api/blocks', {
      token,
      body: { subject: '数学', title: '重叠块', block_date: dayOffset(0), start_time: '06:00', end_time: '07:00' },
    });
    assert.equal(clash.status, 400);
    assert.match(clash.data.message, /冲突/);

    // 未对齐 30 分钟 -> 400
    const misaligned = await req('POST', '/api/blocks', {
      token,
      body: { subject: '数学', title: '未对齐', block_date: dayOffset(0), start_time: '06:15', end_time: '06:45' },
    });
    assert.equal(misaligned.status, 400);

    await req('DELETE', `/api/blocks/${ok.data.block.id}`, { token });
  });

  test('状态机：planned → in_progress → done 合法；done 之后不可再流转', async () => {
    const token = await login('demo', 'demo123');
    const created = await req('POST', '/api/blocks', {
      token,
      body: { subject: '英语', title: '状态机用例', block_date: dayOffset(0), start_time: '05:00', end_time: '05:30' },
    });
    const bid = created.data.block.id;

    const p1 = await req('PUT', `/api/blocks/${bid}/status`, { token, body: { status: 'in_progress' } });
    assert.equal(p1.status, 200);
    assert.equal(p1.data.block.status, 'in_progress');

    const p2 = await req('PUT', `/api/blocks/${bid}/status`, { token, body: { status: 'done' } });
    assert.equal(p2.status, 200);
    assert.equal(p2.data.block.status, 'done');

    // 终态再流转 -> 400
    const p3 = await req('PUT', `/api/blocks/${bid}/status`, { token, body: { status: 'planned' } });
    assert.equal(p3.status, 400);
    assert.match(p3.data.message, /非法状态流转|无需重复/);

    await req('DELETE', `/api/blocks/${bid}`, { token });
  });

  test('状态机：跳过必须填原因；planned 可直接 done', async () => {
    const token = await login('demo', 'demo123');
    const created = await req('POST', '/api/blocks', {
      token,
      body: { subject: '政治', title: '跳过用例', block_date: dayOffset(0), start_time: '04:00', end_time: '04:30' },
    });
    const bid = created.data.block.id;

    // 跳过但没填原因 -> 400
    const noReason = await req('PUT', `/api/blocks/${bid}/status`, { token, body: { status: 'skipped' } });
    assert.equal(noReason.status, 400);
    assert.match(noReason.data.message, /原因/);

    // 填了原因 -> 200
    const skipped = await req('PUT', `/api/blocks/${bid}/status`, {
      token, body: { status: 'skipped', skip_reason: '临时加课，时间冲突' },
    });
    assert.equal(skipped.status, 200);
    assert.equal(skipped.data.block.skip_reason, '临时加课，时间冲突');

    // skipped 是终态
    const again = await req('PUT', `/api/blocks/${bid}/status`, { token, body: { status: 'done' } });
    assert.equal(again.status, 400);

    await req('DELETE', `/api/blocks/${bid}`, { token });
  });

  test('拖拽改时段：schedule 接口校验粒度与冲突', async () => {
    const token = await login('demo', 'demo123');
    const created = await req('POST', '/api/blocks', {
      token,
      body: { subject: '数据结构', title: '拖拽用例', block_date: dayOffset(0), start_time: '03:00', end_time: '03:30' },
    });
    const bid = created.data.block.id;

    const moved = await req('PUT', `/api/blocks/${bid}/schedule`, {
      token, body: { start_time: '03:30', end_time: '04:00' },
    });
    assert.equal(moved.status, 200);
    assert.equal(moved.data.block.start_time, '03:30');

    const bad = await req('PUT', `/api/blocks/${bid}/schedule`, {
      token, body: { start_time: '03:15', end_time: '03:45' },
    });
    assert.equal(bad.status, 400);

    await req('DELETE', `/api/blocks/${bid}`, { token });
  });

  test('完成时间块会累加当日学习时长', async () => {
    const token = await login('demo', 'demo123');
    const before = (await req('GET', `/api/stats/14`, { token })).data.total_hours;
    const created = await req('POST', '/api/blocks', {
      token,
      body: { subject: '数学', title: '计时用例', block_date: dayOffset(0), start_time: '02:00', end_time: '03:00' },
    });
    const bid = created.data.block.id;
    await req('PUT', `/api/blocks/${bid}/status`, { token, body: { status: 'done' } });
    const after = (await req('GET', `/api/stats/14`, { token })).data.total_hours;
    assert.ok(after > before, `完成后时长应增加：${before} -> ${after}`);
    await req('DELETE', `/api/blocks/${bid}`, { token });
  });

  test('时间块分页 + 状态筛选', async () => {
    const token = await login('demo', 'demo123');
    const paged = await req('GET', '/api/blocks?page=1&pageSize=5', { token });
    assert.equal(paged.status, 200);
    assert.ok(paged.data.blocks.length <= 5);
    assert.ok(paged.data.total >= 50);
    assert.equal(paged.data.page, 1);

    const done = await req('GET', '/api/blocks?status=done&page=1&pageSize=5', { token });
    assert.equal(done.status, 200);
    assert.ok(done.data.blocks.every((b) => b.status === 'done'));

    const bad = await req('GET', '/api/blocks?status=no_such_status', { token });
    assert.equal(bad.status, 200); // 非法筛选值被忽略，不报错
  });
});

// ================= 科目 & 知识点 =================
describe('科目与知识点', () => {
  test('科目列表含知识点数量与平均掌握度', async () => {
    const token = await login('demo', 'demo123');
    const r = await req('GET', '/api/subjects', { token });
    assert.equal(r.status, 200);
    assert.equal(r.data.subjects.length, 6);
    assert.ok(r.data.subjects.every((s) => s.kp_count === 5));
  });

  test('知识点列表可按科目筛选，支持分页', async () => {
    const token = await login('demo', 'demo123');
    const all = await req('GET', '/api/subjects/knowledge-points?page=1&pageSize=10', { token });
    assert.equal(all.status, 200);
    assert.equal(all.data.total, 30);
    assert.equal(all.data.knowledge_points.length, 10);

    const subs = (await req('GET', '/api/subjects', { token })).data.subjects;
    const math = subs.find((s) => s.name === '数学');
    const filtered = await req('GET', `/api/subjects/knowledge-points?subject_id=${math.id}`, { token });
    assert.ok(filtered.data.knowledge_points.every((k) => k.subject_id === math.id));
  });

  test('新建知识点：科目不存在 -> 404', async () => {
    const token = await login('demo', 'demo123');
    const r = await req('POST', '/api/subjects/knowledge-points', { token, body: { subject_id: 999999, name: '幽灵知识点' } });
    assert.equal(r.status, 404);
  });
});

// ================= 模考记录 =================
describe('模考记录', () => {
  test('趋势接口返回分数曲线与提分幅度', async () => {
    const token = await login('demo', 'demo123');
    const r = await req('GET', '/api/exams/trend', { token });
    assert.equal(r.status, 200);
    assert.equal(r.data.count, 12);
    assert.equal(r.data.trend.length, 12);
    assert.ok(r.data.delta > 0, '种子数据应为稳步提分');
    assert.ok(r.data.best && r.data.best.total_score >= 400);
    assert.ok(r.data.subjects.length > 0);
  });

  test('录入模考：总分超过满分 -> 400', async () => {
    const token = await login('demo', 'demo123');
    const r = await req('POST', '/api/exams', {
      token,
      body: { exam_name: '非法模考', exam_date: dayOffset(0), total_score: 600, full_score: 500 },
    });
    assert.equal(r.status, 400);
  });

  test('录入 / 编辑 / 删除模考，各科得分结构化返回', async () => {
    const token = await login('demo', 'demo123');
    const created = await req('POST', '/api/exams', {
      token,
      body: {
        exam_name: '第 13 次全真模考', exam_date: dayOffset(0), total_score: 430, full_score: 500,
        subject_scores: [{ subject: '数学', score: 120, full: 150 }, { subject: '英语', score: 70, full: 100 }],
        rank_no: 15, note: '冲刺阶段',
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.exam.subject_scores.length, 2);

    const upd = await req('PUT', `/api/exams/${created.data.exam.id}`, { token, body: { total_score: 445 } });
    assert.equal(upd.data.exam.total_score, 445);

    const list = await req('GET', '/api/exams?page=1&pageSize=5', { token });
    assert.ok(list.data.total >= 13);

    const del = await req('DELETE', `/api/exams/${created.data.exam.id}`, { token });
    assert.equal(del.status, 200);
  });
});

// ================= 错题本 =================
describe('错题本', () => {
  test('概览统计返回掌握率与各科分布', async () => {
    const token = await login('demo', 'demo123');
    const r = await req('GET', '/api/wrong/summary', { token });
    assert.equal(r.status, 200);
    assert.equal(r.data.total, 25);
    assert.equal(typeof r.data.mastery_rate, 'number');
    assert.ok(r.data.subjects.length > 0);
  });

  test('错题状态机：new → reviewing → mastered；mastered 可回到 reviewing', async () => {
    const token = await login('demo', 'demo123');
    const created = await req('POST', '/api/wrong', {
      token,
      body: { subject: '数学', knowledge_point: '洛必达法则', question: '求 lim(x→0) sinx/x', my_answer: '0', right_answer: '1', wrong_reason: '极限基本公式记错' },
    });
    assert.equal(created.status, 201);
    const wid = created.data.wrong_question.id;
    assert.equal(created.data.wrong_question.status, 'new');

    const r1 = await req('PUT', `/api/wrong/${wid}/review`, { token, body: {} });
    assert.equal(r1.status, 200);
    assert.equal(r1.data.wrong_question.status, 'reviewing');
    assert.equal(r1.data.wrong_question.review_count, 1);

    const r2 = await req('PUT', `/api/wrong/${wid}/master`, { token, body: { mastered: true } });
    assert.equal(r2.status, 200);
    assert.equal(r2.data.wrong_question.status, 'mastered');

    // 已掌握再标掌握 -> 400（重复流转）
    const r3 = await req('PUT', `/api/wrong/${wid}/master`, { token, body: { mastered: true } });
    assert.equal(r3.status, 400);

    // 取消掌握 -> reviewing
    const r4 = await req('PUT', `/api/wrong/${wid}/master`, { token, body: { mastered: false } });
    assert.equal(r4.status, 200);
    assert.equal(r4.data.wrong_question.status, 'reviewing');

    await req('DELETE', `/api/wrong/${wid}`, { token });
  });

  test('录入错题：缺题目 -> 400；列表支持分页与科目筛选', async () => {
    const token = await login('demo', 'demo123');
    const bad = await req('POST', '/api/wrong', { token, body: { subject: '数学' } });
    assert.equal(bad.status, 400);

    const paged = await req('GET', '/api/wrong?page=1&pageSize=10', { token });
    assert.equal(paged.status, 200);
    assert.equal(paged.data.wrong_questions.length, 10);
    assert.equal(paged.data.total, 25);

    const bySubject = await req('GET', '/api/wrong?subject=数学', { token });
    assert.ok(bySubject.data.wrong_questions.every((w) => w.subject === '数学'));
  });

  test('错题列表状态筛选：非法状态被忽略而非报错', async () => {
    const token = await login('demo', 'demo123');
    const r = await req('GET', '/api/wrong?status=bogus', { token });
    assert.equal(r.status, 200);
    assert.ok(r.data.wrong_questions.length > 0);
  });
});

// ================= 学习资料库 =================
describe('学习资料库', () => {
  test('概览返回总页数、已读页数与进度', async () => {
    const token = await login('demo', 'demo123');
    const r = await req('GET', '/api/materials/summary', { token });
    assert.equal(r.status, 200);
    assert.equal(r.data.total, 20);
    assert.ok(r.data.pages > 0);
    assert.ok(r.data.progress > 0 && r.data.progress <= 100);
  });

  test('更新阅读进度：超过总页数 -> 400；达到总页数自动完成', async () => {
    const token = await login('demo', 'demo123');
    const list = await req('GET', '/api/materials?page=1&pageSize=1', { token });
    const m = list.data.materials[0];

    const bad = await req('PUT', `/api/materials/${m.id}/progress`, { token, body: { read_pages: m.total_pages + 10 } });
    assert.equal(bad.status, 400);

    const ok = await req('PUT', `/api/materials/${m.id}/progress`, { token, body: { read_pages: m.total_pages } });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.material.status, 'finished');
  });

  test('新建资料：非法链接 -> 400；分页可用', async () => {
    const token = await login('demo', 'demo123');
    const bad = await req('POST', '/api/materials', {
      token, body: { subject: '数学', title: '坏链接', type: 'link', url: 'ftp://x' },
    });
    assert.equal(bad.status, 400);

    const paged = await req('GET', '/api/materials?page=1&pageSize=5', { token });
    assert.equal(paged.data.materials.length, 5);
    assert.equal(paged.data.total, 20);
  });
});

// ================= 提醒中心 =================
describe('提醒中心', () => {
  test('概览返回待处理与逾期数量', async () => {
    const token = await login('demo', 'demo123');
    const r = await req('GET', '/api/reminders/summary', { token });
    assert.equal(r.status, 200);
    assert.ok(r.data.total >= 15, `种子至少 15 条提醒，实际 ${r.data.total}`);
    assert.equal(typeof r.data.by_status.pending, 'number');
    assert.equal(typeof r.data.overdue, 'number');
  });

  test('提醒状态机：pending → done；done 为终态', async () => {
    const token = await login('demo', 'demo123');
    const created = await req('POST', '/api/reminders', {
      token, body: { title: '测试提醒', remind_at: `${dayOffset(0)} 19:00` },
    });
    assert.equal(created.status, 201);
    const rid = created.data.reminder.id;

    const d1 = await req('PUT', `/api/reminders/${rid}/status`, { token, body: { status: 'done' } });
    assert.equal(d1.status, 200);

    const d2 = await req('PUT', `/api/reminders/${rid}/status`, { token, body: { status: 'pending' } });
    assert.equal(d2.status, 400);

    await req('DELETE', `/api/reminders/${rid}`, { token });
  });

  test('新建提醒：时间格式非法 -> 400', async () => {
    const token = await login('demo', 'demo123');
    const r = await req('POST', '/api/reminders', { token, body: { title: '格式错', remind_at: '2026/01/01 08:00' } });
    assert.equal(r.status, 400);
  });

  test('扫描未完成计划生成补做提醒（幂等）', async () => {
    const token = await login('demo', 'demo123');
    const first = await req('POST', '/api/reminders/scan', { token });
    assert.equal(first.status, 200);
    assert.ok(first.data.created >= 1, '种子里存在过去未完成的时间块');

    const second = await req('POST', '/api/reminders/scan', { token });
    assert.equal(second.status, 200);
    assert.equal(second.data.created, 0, '重复扫描不应重复生成');
  });
});

// ================= 做题正确率 =================
describe('做题正确率', () => {
  test('录入做题并验证正确率计算正确', async () => {
    const token = await login('demo', 'demo123');
    const r = await req('POST', '/api/tasks', {
      token, body: { subject: '数学', total: 20, correct: 15, tags: '极限,导数' },
    });
    assert.equal(r.status, 201);

    const acc = await req('GET', '/api/tasks/accuracy', { token });
    const math = acc.data.accuracy.find((s) => s.subject === '数学');
    assert.ok(math);
    assert.equal(math.accuracy, Math.round(math.correct / math.total * 100));
  });

  test('做对数超过做题数 -> 400', async () => {
    const token = await login('demo', 'demo123');
    const r = await req('POST', '/api/tasks', { token, body: { subject: '英语', total: 10, correct: 12 } });
    assert.equal(r.status, 400);
  });
});

// ================= 学习时长 =================
describe('学习时长', () => {
  test('录入时长并返回总数', async () => {
    const token = await login('demo', 'demo123');
    const r = await req('POST', '/api/stats', { token, body: { hours: 2.5 } });
    assert.equal(r.status, 200);
    assert.equal(r.data.stat.hours >= 2.5, true);

    const list = await req('GET', '/api/stats/7', { token });
    assert.ok(list.data.total_hours > 0);
  });

  test('录入非法时长 -> 400', async () => {
    const token = await login('demo', 'demo123');
    const r = await req('POST', '/api/stats', { token, body: { hours: -1 } });
    assert.equal(r.status, 400);
  });
});

// ================= 个人概览 =================
describe('个人概览', () => {
  test('overview 返回倒计时/完成度/正确率/时间块/模考/错题/资料/提醒', async () => {
    const token = await login('demo', 'demo123');
    const r = await req('GET', '/api/auth/overview', { token });
    assert.equal(r.status, 200);
    const o = r.data.overview;
    assert.equal(typeof o.days_left, 'number');
    assert.equal(typeof o.goal_progress, 'number');
    assert.equal(typeof o.accuracy, 'number');
    assert.ok(o.plan_total >= 0);
    assert.equal(typeof o.wrong_total, 'number');
    assert.equal(typeof o.material_progress, 'number');
    assert.equal(typeof o.pending_reminders, 'number');
  });
});

// ================= AI 能力（本地降级） =================
describe('AI 能力（本地规则降级）', () => {
  test('AI 生成计划 -> 落库为 plan_blocks 并写入日历', async () => {
    const token = await login('demo', 'demo123');
    const r = await req('POST', '/api/ai/plan', { token, body: {} });
    assert.equal(r.status, 200);
    assert.equal(r.data.source, '内置规则引擎'); // 未配置 key -> 降级
    assert.ok(Array.isArray(r.data.blocks));
    assert.ok(r.data.blocks.length > 0);
    const aiOnly = r.data.blocks.filter((b) => b.source === 'ai');
    assert.ok(aiOnly.length > 0, 'AI 结果应落库为 plan_blocks');
    assert.ok(aiOnly.every((b) => b.status === 'planned'));

    // 落库校验：日历接口能读到这批 AI 块
    const cal = await req('GET', `/api/blocks/calendar?date=${r.data.date}&days=1`, { token });
    const aiBlocks = cal.data.days[0].blocks.filter((b) => b.source === 'ai');
    assert.equal(aiBlocks.length, aiOnly.length);
    // 30 分钟粒度
    assert.ok(aiBlocks.every((b) => {
      const [sh, sm] = b.start_time.split(':').map(Number);
      const [eh, em] = b.end_time.split(':').map(Number);
      const dur = (eh * 60 + em) - (sh * 60 + sm);
      return dur > 0 && dur % 30 === 0;
    }));
    // 生成的块之间不重叠
    const sorted = [...aiBlocks].sort((a, b) => a.start_time.localeCompare(b.start_time));
    for (let i = 1; i < sorted.length; i++) {
      assert.ok(sorted[i].start_time >= sorted[i - 1].end_time, 'AI 时间块不应重叠');
    }
  });

  test('AI 错误分析 -> 返回建议与 source（含落库开关）', async () => {
    const token = await login('demo', 'demo123');
    const r = await req('POST', '/api/ai/analysis', { token, body: { subject: '数学' } });
    assert.equal(r.status, 200);
    assert.equal(typeof r.data.advice, 'string');
    assert.ok(r.data.advice.length > 0);
    assert.equal(r.data.source, '内置规则引擎');
  });

  test('AI 分析 save=true 时把建议落库为待办提醒', async () => {
    const token = await login('demo', 'demo123');
    const before = (await req('GET', '/api/reminders/summary', { token })).data.total;
    const r = await req('POST', '/api/ai/analysis', { token, body: { subject: '英语', save: true } });
    assert.equal(r.status, 200);
    assert.ok(r.data.reminder && r.data.reminder.id);
    const after = (await req('GET', '/api/reminders/summary', { token })).data.total;
    assert.equal(after, before + 1);
    await req('DELETE', `/api/reminders/${r.data.reminder.id}`, { token });
  });

  test('AI 单题讲解 -> 本地降级返回解析', async () => {
    const token = await login('demo', 'demo123');
    const bad = await req('POST', '/api/ai/explain', { token, body: {} });
    assert.equal(bad.status, 400);

    const r = await req('POST', '/api/ai/explain', {
      token, body: { subject: '数学', question: '求 lim(x→0) (1-cosx)/x²' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.source, '内置讲解引擎');
    assert.ok(r.data.explanation.length > 20);
  });
});

// ================= Admin 仪表盘 =================
describe('Admin 仪表盘', () => {
  test('admin 可读取看板、新模块统计与用户列表', async () => {
    const token = await login('admin', 'admin123');
    const dash = await req('GET', '/api/admin/dashboard', { token });
    assert.equal(dash.status, 200);
    assert.ok(dash.data.dashboard.users >= 3);
    assert.equal(typeof dash.data.dashboard.blocks_total, 'number');
    assert.equal(typeof dash.data.dashboard.wrong_total, 'number');
    assert.equal(typeof dash.data.dashboard.mock_count, 'number');
    assert.equal(typeof dash.data.dashboard.material_count, 'number');
    assert.ok(dash.data.dashboard.role_distribution.length >= 2);

    const users = await req('GET', '/api/admin/users', { token });
    assert.equal(users.status, 200);
    assert.ok(users.data.users.some((u) => u.username === 'admin'));
    assert.equal(typeof users.data.users[0].blocks, 'number');

    const paged = await req('GET', '/api/admin/users?page=1&pageSize=2', { token });
    assert.equal(paged.data.users.length, 2);
    assert.equal(paged.data.pageSize, 2);
  });
});
