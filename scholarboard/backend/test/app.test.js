// 核心链路接口测试（node:test，Node 18+ 自带全局 fetch）
// 运行：cd backend && npm test
// 使用独立临时数据库，不影响开发数据；AI 未配置 LLM_API_KEY 时验证 local 保底输出。
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// 必须在 require('./db') 之前设置，且覆盖 dotenv
const DATA_DIR = path.join(__dirname, '..', 'data', 'test');
fs.mkdirSync(DATA_DIR, { recursive: true });
const TEST_DB = path.join(DATA_DIR, `test-${Date.now()}.db`);
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'test-secret-for-app-tests';
process.env.LLM_API_KEY = ''; // 确保走本地保底

const app = require('../src/app');
const seed = require('../src/seed');
const db = require('../src/db');

let server;
let base;
const tokens = {};

async function req(method, url, token, body) {
  const headers = {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const resp = await fetch(base + url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: resp.status, data: await resp.json() };
}

async function login(username, password) {
  const r = await req('POST', '/api/auth/login', null, { username, password });
  return r.data.data.token;
}

before(async () => {
  seed(); // 幂等灌入 admin + 演示数据
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  tokens.admin = await login('admin', 'admin123');
  tokens.alice = await login('alice', '123456');
  tokens.bob = await login('bob', '123456');
});

after(() => {
  server && server.close();
  try { db.close(); } catch { /* 可能已关闭 */ }
  for (const f of ['', '-wal', '-shm', '-journal']) {
    try { fs.unlinkSync(TEST_DB + f); } catch { /* 忽略 */ }
  }
});

// ============ 1-5 基础与认证 ============
test('01 健康检查', async () => {
  const r = await req('GET', '/api/health');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.code, 0);
  assert.strictEqual(r.data.data.service, 'scholarboard');
});

test('02 注册：成功并返回 token', async () => {
  const r = await req('POST', '/api/auth/register', null, { username: 'tester01', password: 'pass123', nickname: '测试' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.code, 0);
  assert.ok(r.data.data.token);
  assert.strictEqual(r.data.data.user.role, 'user');
});

test('03 注册：密码过短 → 400', async () => {
  const r = await req('POST', '/api/auth/register', null, { username: 'tester02', password: '123' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.data.code, 400);
});

test('04 注册：用户名重复 → 409', async () => {
  const r = await req('POST', '/api/auth/register', null, { username: 'admin', password: 'pass123' });
  assert.strictEqual(r.status, 409);
});

test('05 登录：密码错误 → 401', async () => {
  const r = await req('POST', '/api/auth/login', null, { username: 'admin', password: 'wrong' });
  assert.strictEqual(r.status, 401);
});

// ============ 6-8 权限 ============
test('06 未登录访问受保护接口 → 401', async () => {
  const r = await req('GET', '/api/notes');
  assert.strictEqual(r.status, 401);
});

test('07 普通用户访问 Admin 接口 → 403', async () => {
  const r = await req('GET', '/api/admin/overview', tokens.alice);
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.data.code, 403);
});

test('08 管理员访问 Admin 统计接口 → 200 且统计口径扩展', async () => {
  const r = await req('GET', '/api/admin/overview', tokens.admin);
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.data.stats.totalUsers >= 4);
  // 新表统计存在
  assert.ok(typeof r.data.data.stats.totalProjects === 'number');
  assert.ok(typeof r.data.data.stats.totalVersions === 'number');
  assert.ok(typeof r.data.data.stats.totalExperiences === 'number');
  assert.ok(r.data.data.stats.totalNotes >= 25);
});

// ============ 9-11 笔记 CRUD + 版本 ============
test('09 笔记 CRUD 与搜索', async () => {
  const created = await req('POST', '/api/notes', tokens.alice, { title: '测试笔记', content: '内容A', tags: ['测试', 't1'] });
  assert.strictEqual(created.status, 201);
  const id = created.data.data.note.id;

  const list = await req('GET', '/api/notes?q=内容A', tokens.alice);
  assert.strictEqual(list.status, 200);
  assert.ok(list.data.data.notes.some((n) => n.id === id));
  assert.ok(Number.isInteger(list.data.data.total));

  const updated = await req('PUT', `/api/notes/${id}`, tokens.alice, { title: '改名笔记', favorite: true });
  assert.strictEqual(updated.data.data.note.title, '改名笔记');
  assert.strictEqual(updated.data.data.note.favorite, true);

  const del = await req('DELETE', `/api/notes/${id}`, tokens.alice);
  assert.strictEqual(del.status, 200);
  const gone = await req('GET', '/api/notes?q=改名笔记', tokens.alice);
  assert.ok(!gone.data.data.notes.some((n) => n.id === id));
});

test('10 笔记创建：标题为空 → 400', async () => {
  const r = await req('POST', '/api/notes', tokens.alice, { title: '', content: '' });
  assert.strictEqual(r.status, 400);
});

test('11 笔记版本：每次保存生成快照，可对比与回滚', async () => {
  const created = await req('POST', '/api/notes', tokens.alice, { title: '版本测试', content: '第一版内容', tags: ['版本'] });
  const id = created.data.data.note.id;

  await req('PUT', `/api/notes/${id}`, tokens.alice, { content: '第二版内容，有所改动' });
  await req('PUT', `/api/notes/${id}`, tokens.alice, { content: '第三版内容，再次改动' });

  const versions = await req('GET', `/api/notes/${id}/versions`, tokens.alice);
  assert.strictEqual(versions.status, 200);
  assert.ok(versions.data.data.versions.length >= 3, '应至少有 3 个版本快照');
  assert.strictEqual(versions.data.data.max_versions, 20);

  const first = versions.data.data.versions[versions.data.data.versions.length - 1];
  const diff = await req('GET', `/api/notes/${id}/versions/${first.id}/diff`, tokens.alice);
  assert.strictEqual(diff.status, 200);
  assert.ok(Array.isArray(diff.data.data.lines));
  assert.ok(diff.data.data.lines.some((l) => l.type === 'add') || diff.data.data.lines.some((l) => l.type === 'del'));

  const rb = await req('POST', `/api/notes/${id}/versions/${first.id}/rollback`, tokens.alice);
  assert.strictEqual(rb.status, 200);
  assert.strictEqual(rb.data.data.note.content, '第一版内容');

  // 回滚本身也留了快照，可再次回滚
  const after = await req('GET', `/api/notes/${id}/versions`, tokens.alice);
  assert.ok(after.data.data.versions.length >= 4);
});

test('12 笔记版本：越权访问他人版本 → 404', async () => {
  const created = await req('POST', '/api/notes', tokens.alice, { title: '私有笔记', content: 'x' });
  const id = created.data.data.note.id;
  const r = await req('GET', `/api/notes/${id}/versions`, tokens.bob);
  assert.strictEqual(r.status, 404);
});

// ============ 13-16 项目与标签 ============
test('13 项目分组：创建 / 归档 / 重名 409', async () => {
  const created = await req('POST', '/api/projects', tokens.alice, { name: '测试项目', color: 'blue' });
  assert.strictEqual(created.status, 201);
  const id = created.data.data.project.id;

  const dup = await req('POST', '/api/projects', tokens.alice, { name: '测试项目' });
  assert.strictEqual(dup.status, 409);

  const arch = await req('PUT', `/api/projects/${id}`, tokens.alice, { archived: true });
  assert.strictEqual(arch.data.data.project.archived, true);

  const list = await req('GET', '/api/projects?archived=1', tokens.alice);
  assert.ok(list.data.data.projects.some((p) => p.id === id));

  const del = await req('DELETE', `/api/projects/${id}`, tokens.alice);
  assert.strictEqual(del.status, 200);
});

test('14 标签：多对多关联与按标签筛选', async () => {
  const created = await req('POST', '/api/notes', tokens.alice, { title: '标签筛选测试', content: 'abc', tags: ['筛选标签A', '筛选标签B'] });
  const noteId = created.data.data.note.id;

  const tags = await req('GET', '/api/tags', tokens.alice);
  assert.strictEqual(tags.status, 200);
  const tagA = tags.data.data.tags.find((t) => t.name === '筛选标签A');
  assert.ok(tagA, '标签应被自动创建');
  assert.ok(tagA.count >= 1);

  const filtered = await req('GET', `/api/tags/${tagA.id}/notes`, tokens.alice);
  assert.ok(filtered.data.data.notes.some((n) => n.id === noteId));

  const byName = await req('GET', '/api/notes?tag=筛选标签A', tokens.alice);
  assert.ok(byName.data.data.notes.some((n) => n.id === noteId));

  await req('DELETE', `/api/notes/${noteId}`, tokens.alice);
});

test('15 标签：重名 409 与删除', async () => {
  const c = await req('POST', '/api/tags', tokens.alice, { name: '唯一标签X' });
  assert.strictEqual(c.status, 201);
  const dup = await req('POST', '/api/tags', tokens.alice, { name: '唯一标签X' });
  assert.strictEqual(dup.status, 409);
  const del = await req('DELETE', `/api/tags/${c.data.data.tag.id}`, tokens.alice);
  assert.strictEqual(del.status, 200);
});

test('16 分页：pageSize 边界与 total 一致', async () => {
  const p1 = await req('GET', '/api/notes?page=1&pageSize=5', tokens.alice);
  assert.strictEqual(p1.data.data.notes.length <= 5, true);
  assert.ok(p1.data.data.total >= p1.data.data.notes.length);
  assert.strictEqual(p1.data.data.page, 1);

  // pageSize 超上限被裁剪到 100
  const big = await req('GET', '/api/notes?page=1&pageSize=9999', tokens.alice);
  assert.strictEqual(big.data.data.pageSize, 100);

  // 页码越界返回空数组而不是报错
  const far = await req('GET', '/api/notes?page=999&pageSize=10', tokens.alice);
  assert.strictEqual(far.status, 200);
  assert.deepStrictEqual(far.data.data.notes, []);
});

// ============ 17-20 简历状态机与结构化 ============
test('17 简历状态机：draft → polished → final 合法流转', async () => {
  const created = await req('POST', '/api/resumes', tokens.alice, {
    title: '状态机测试简历', target_job: '前端', skills: ['Vue'],
    experiences: [{ org: '实验室', role: '成员', start_date: '2025-01', end_date: '2025-06', description: '做了数据分析。' }],
  });
  const id = created.data.data.resume.id;
  assert.strictEqual(created.data.data.resume.status, 'draft');

  const p = await req('PUT', `/api/resumes/${id}`, tokens.alice, { status: 'polished' });
  assert.strictEqual(p.status, 200);
  assert.strictEqual(p.data.data.resume.status, 'polished');

  const f = await req('PUT', `/api/resumes/${id}`, tokens.alice, { status: 'final' });
  assert.strictEqual(f.data.data.resume.status, 'final');
  assert.ok(f.data.data.resume.finalized_at);

  // 回退合法
  const back = await req('PUT', `/api/resumes/${id}`, tokens.alice, { status: 'polished' });
  assert.strictEqual(back.status, 200);
});

test('18 简历状态机：非法流转 → 400', async () => {
  const created = await req('POST', '/api/resumes', tokens.alice, { title: '非法流转测试', skills: [] });
  const id = created.data.data.resume.id;

  // draft → final 不允许（必须先润色）
  const bad = await req('PUT', `/api/resumes/${id}`, tokens.alice, { status: 'final' });
  assert.strictEqual(bad.status, 400);
  assert.match(bad.data.message, /非法状态流转/);

  // 未知状态
  const unknown = await req('PUT', `/api/resumes/${id}`, tokens.alice, { status: 'published' });
  assert.strictEqual(unknown.status, 400);
});

test('19 简历：定稿后锁定编辑 → 400', async () => {
  const created = await req('POST', '/api/resumes', tokens.alice, {
    title: '锁定测试', skills: ['A'], experiences: [{ org: 'X', role: 'Y', description: 'Z' }],
  });
  const id = created.data.data.resume.id;
  await req('PUT', `/api/resumes/${id}`, tokens.alice, { status: 'polished' });
  await req('PUT', `/api/resumes/${id}`, tokens.alice, { status: 'final' });

  const edit = await req('PUT', `/api/resumes/${id}`, tokens.alice, { title: '想改标题' });
  assert.strictEqual(edit.status, 400);
  assert.match(edit.data.message, /锁定/);

  const addExp = await req('POST', `/api/resumes/${id}/experiences`, tokens.alice, { org: '新公司' });
  assert.strictEqual(addExp.status, 400);
});

test('20 简历经历：结构化 CRUD 与拖拽排序', async () => {
  const created = await req('POST', '/api/resumes', tokens.alice, { title: '经历排序测试', skills: [] });
  const id = created.data.data.resume.id;

  const e1 = await req('POST', `/api/resumes/${id}/experiences`, tokens.alice, { org: 'A公司', role: '实习', start_date: '2025-01', end_date: '2025-03', description: '第一段。做了 A。' });
  const e2 = await req('POST', `/api/resumes/${id}/experiences`, tokens.alice, { org: 'B公司', role: '实习', start_date: '2025-04', end_date: '2025-06', description: '第二段。做了 B。' });
  assert.strictEqual(e1.status, 201);

  const detail = await req('GET', `/api/resumes/${id}`, tokens.alice);
  assert.strictEqual(detail.data.data.resume.experiences.length, 2);
  assert.strictEqual(detail.data.data.resume.experiences[0].org, 'A公司');

  const reorder = await req('PUT', `/api/resumes/${id}/experiences/reorder`, tokens.alice, { order: [e2.data.data.experience.id, e1.data.data.experience.id] });
  assert.strictEqual(reorder.status, 200);
  assert.strictEqual(reorder.data.data.experiences[0].org, 'B公司');

  // 排序列表与现有经历不匹配 → 400
  const badOrder = await req('PUT', `/api/resumes/${id}/experiences/reorder`, tokens.alice, { order: [99999] });
  assert.strictEqual(badOrder.status, 400);
});

// ============ 21-23 AI 落库与降级 ============
test('21 AI 文本润色：未配置 key 返回本地保底（source: local）', async () => {
  const r = await req('POST', '/api/ai/polish', tokens.alice, { text: '我学习了计算机网络。它重要。' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.data.source, 'local');
  assert.ok(String(r.data.data.polished).length > 0);
});

test('22 AI 简历润色：写入 polished + 生成结构化亮点，并自动流转 draft → polished', async () => {
  const created = await req('POST', '/api/resumes', tokens.alice, {
    title: 'AI 润色落库测试', target_job: '前端实习生', skills: ['Vue', 'Node'],
    experiences: [{ org: '实验室', role: '成员', start_date: '2025-01', end_date: '2025-06', description: '做了数据分析。输出了一份报告。' }],
  });
  const id = created.data.data.resume.id;

  const res = await req('POST', `/api/resumes/${id}/polish`, tokens.alice);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.data.source, 'local');
  assert.ok(String(res.data.data.polished).length > 0);
  // 原稿保留
  assert.deepStrictEqual(res.data.data.resume.skills, ['Vue', 'Node']);
  assert.strictEqual(res.data.data.resume.target_job, '前端实习生');
  // 状态机自动流转
  assert.strictEqual(res.data.data.resume.status, 'polished');
  // 结构化亮点已落库
  assert.ok(res.data.data.resume.experiences[0].highlights.length > 0);
});

test('23 AI 润色结果一键应用回原稿', async () => {
  const created = await req('POST', '/api/resumes', tokens.alice, {
    title: '应用润色测试', skills: [],
    experiences: [{ org: '某公司', role: '实习生', description: '负责了一个模块。优化了性能。' }],
  });
  const id = created.data.data.resume.id;
  await req('POST', `/api/resumes/${id}/polish`, tokens.alice);

  const apply = await req('POST', `/api/resumes/${id}/apply-polish`, tokens.alice, { overwrite: true });
  assert.strictEqual(apply.status, 200);
  assert.ok(apply.data.data.applied >= 1);
  const desc = apply.data.data.resume.experiences[0].description;
  assert.ok(desc && desc.length > 0);

  // 未润色就应用 → 400
  const plain = await req('POST', '/api/resumes', tokens.alice, { title: '无润色', skills: [] });
  const noPolish = await req('POST', `/api/resumes/${plain.data.data.resume.id}/apply-polish`, tokens.alice, {});
  assert.strictEqual(noPolish.status, 400);
});

// ============ 24-26 任务 / 活动流 / 越权 ============
test('24 任务 CRUD 与完成态切换', async () => {
  const created = await req('POST', '/api/tasks', tokens.alice, { title: '测试任务', priority: 'high' });
  assert.strictEqual(created.status, 201);
  const id = created.data.data.task.id;

  const done = await req('PUT', `/api/tasks/${id}`, tokens.alice, { done: true });
  assert.strictEqual(done.data.data.task.done, true);

  const bad = await req('POST', '/api/tasks', tokens.alice, { title: 'x', priority: 'urgent' });
  assert.strictEqual(bad.status, 400);

  const del = await req('DELETE', `/api/tasks/${id}`, tokens.alice);
  assert.strictEqual(del.status, 200);
});

test('25 活动流：关键操作被记录且可查询', async () => {
  await req('POST', '/api/notes', tokens.alice, { title: '活动流触发笔记', content: 'x' });
  const r = await req('GET', '/api/activities?pageSize=50', tokens.alice);
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.data.total > 0);
  assert.ok(r.data.data.activities.some((a) => a.type === 'create' && a.target_type === 'note'));
  // 按类型筛选
  const filtered = await req('GET', '/api/activities?type=create', tokens.alice);
  assert.ok(filtered.data.data.activities.every((a) => a.type === 'create'));
});

test('26 越权：普通用户不能读写他人资源 → 404', async () => {
  const created = await req('POST', '/api/notes', tokens.alice, { title: 'Alice 私有', content: 'secret' });
  const noteId = created.data.data.note.id;

  const read = await req('PUT', `/api/notes/${noteId}`, tokens.bob, { title: 'hack' });
  assert.strictEqual(read.status, 404);

  const del = await req('DELETE', `/api/notes/${noteId}`, tokens.bob);
  assert.strictEqual(del.status, 404);

  const task = await req('POST', '/api/tasks', tokens.alice, { title: 'Alice 任务' });
  const taskId = task.data.data.task.id;
  const taskHack = await req('PUT', `/api/tasks/${taskId}`, tokens.bob, { title: 'hack' });
  assert.strictEqual(taskHack.status, 404);
});

test('27 未知接口 → 404（统一响应）', async () => {
  const r = await req('GET', '/api/no-such-route');
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.data.code, 404);
});

test('28 种子数据厚度：11 张表均有数据且跨 ≥14 天', async () => {
  const tables = ['users', 'projects', 'notes', 'note_versions', 'tags', 'note_tags', 'resumes', 'resume_experiences', 'tasks', 'attachments', 'activities'];
  const counts = {};
  for (const t of tables) {
    counts[t] = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  }
  assert.strictEqual(Object.keys(counts).length, 11);
  assert.ok(counts.users >= 4, 'users ≥ 4');
  assert.ok(counts.projects >= 6, 'projects ≥ 6');
  assert.ok(counts.notes >= 25, 'notes ≥ 25');
  assert.ok(counts.note_versions >= 40, 'note_versions ≥ 40');
  assert.ok(counts.tags >= 15, 'tags ≥ 15');
  assert.ok(counts.resumes >= 8, 'resumes ≥ 8');
  assert.ok(counts.resume_experiences >= 20, 'resume_experiences ≥ 20');
  assert.ok(counts.tasks >= 35, 'tasks ≥ 35');
  assert.ok(counts.activities >= 30, 'activities ≥ 30');

  const span = db.prepare("SELECT julianday(MAX(created_at)) - julianday(MIN(created_at)) AS d FROM activities").get().d;
  assert.ok(span >= 13, `活动流应跨 ≥14 天，实际 ${span}`);
});
