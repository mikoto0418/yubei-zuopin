// ScriptForge 后端测试套件。
// 覆盖：鉴权 / 越权（writer 不能改别人作品、editor 可审阅）/ 状态机非法流转 /
//       分页边界 / AI 降级 / 版本快照与回滚 / 故事线完整性 / 逻辑检查落库。
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'scriptforge-test-secret';
delete process.env.LLM_API_KEY;   // 强制走本地降级，验证 source=local

// 每轮测试都用全新的库：否则上一轮注册的账号、写入的快照会污染「种子数据厚度」等断言。
const fs = require('node:fs');
const path = require('node:path');
const TEST_DB = path.join(__dirname, '..', 'data', 'scriptforge-test.db');
process.env.DB_PATH = TEST_DB;
for (const suffix of ['', '-wal', '-shm']) {
  try { fs.unlinkSync(TEST_DB + suffix); } catch { /* 首次运行无文件 */ }
}

const { createApp } = require('../kernel').server;
const { mountRoutes } = require('../routes');
const { db } = require('../db');
const { seedIfNeeded } = require('../seed');

seedIfNeeded();

const PORT = 5294;
let server;
let base;

before(() => {
  const app = createApp({ mountRoutes, frontendDir: '__none__' });
  server = app.listen(PORT);
  base = `http://127.0.0.1:${PORT}`;
});

after(() => { if (server) server.close(); });

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  // 只有需要 body 的方法才发送 body —— fetch 对 GET/HEAD 带 body 会直接抛错。
  const sendBody = body !== undefined && body !== null && method !== 'GET' && method !== 'HEAD';
  const res = await fetch(base + path, {
    method, headers, body: sendBody ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* 非 JSON */ }
  return { status: res.status, json };
}

const uniq = () => 'w' + Date.now() + Math.floor(Math.random() * 1000);

async function loginAs(username, password) {
  const { json } = await call('POST', '/api/auth/login', { username, password });
  return json.data.token;
}

let adminToken, writerToken, editorToken;
let projectId, sceneId, episodeId;

// ———————————— 鉴权 ————————————

test('注册成功返回 token，默认角色为 writer', async () => {
  const username = uniq();
  const { status, json } = await call('POST', '/api/auth/register', { username, password: 'pass1234' });
  assert.strictEqual(status, 200);
  assert.strictEqual(json.code, 0);
  assert.ok(json.data.token);
  assert.strictEqual(json.data.user.role, 'writer');
  assert.strictEqual(json.data.user.password, undefined, '不得回传密码');
});

test('注册不能自封 admin', async () => {
  const username = uniq();
  const { json } = await call('POST', '/api/auth/register', { username, password: 'pass1234', role: 'admin' });
  assert.strictEqual(json.data.user.role, 'writer', '请求 admin 应被降级为 writer');
});

test('重复用户名注册被拒绝', async () => {
  const username = uniq();
  await call('POST', '/api/auth/register', { username, password: 'pass1234' });
  const { status } = await call('POST', '/api/auth/register', { username, password: 'pass1234' });
  assert.strictEqual(status, 409);
});

test('弱密码被拒绝', async () => {
  const { status } = await call('POST', '/api/auth/register', { username: uniq(), password: '123' });
  assert.strictEqual(status, 400);
});

test('未登录访问受保护接口返回 401', async () => {
  const { status } = await call('GET', '/api/projects');
  assert.strictEqual(status, 401);
});

test('错误密码登录返回 401', async () => {
  const { status } = await call('POST', '/api/auth/login', { username: 'writer1', password: 'wrongpass' });
  assert.strictEqual(status, 401);
});

test('种子账号可登录（admin / writer1 / editor1）', async () => {
  adminToken = await loginAs('admin', 'admin123');
  writerToken = await loginAs('writer1', 'writer123');
  editorToken = await loginAs('editor1', 'editor123');
  assert.ok(adminToken && writerToken && editorToken);
});

test('普通用户访问 Admin 概览返回 403', async () => {
  const { status } = await call('GET', '/api/admin/overview', null, writerToken);
  assert.strictEqual(status, 403);
});

test('管理员可访问 Admin 概览，含业务指标', async () => {
  const { status, json } = await call('GET', '/api/admin/overview', null, adminToken);
  assert.strictEqual(status, 200);
  assert.strictEqual(json.code, 0);
  assert.ok(typeof json.data.users === 'number');
  assert.ok(json.data.projects_total >= 2, '应统计到种子作品');
  assert.ok(json.data.characters_total >= 8);
});

test('API 404 返回 JSON 而非 HTML', async () => {
  const { status, json } = await call('GET', '/api/definitely-not-exist');
  assert.strictEqual(status, 404);
  assert.notStrictEqual(json.code, 0);
});

// ———————————— 分页 / 搜索 / 筛选 ————————————

test('作品列表分页返回正确结构', async () => {
  const { status, json } = await call('GET', '/api/projects?page=1&pageSize=1', null, writerToken);
  assert.strictEqual(status, 200);
  assert.ok(Array.isArray(json.data.list));
  assert.strictEqual(json.data.list.length, 1);
  assert.strictEqual(json.data.page, 1);
  assert.ok(json.data.total >= 2);
  assert.ok(json.data.pages >= 2);
});

test('分页边界：page=999 返回空列表但总数不变', async () => {
  const { json } = await call('GET', '/api/projects?page=999&pageSize=12', null, writerToken);
  assert.strictEqual(json.data.list.length, 0);
  assert.ok(json.data.total >= 2);
});

test('pageSize 超上限被夹到 100，page<1 被夹到 1', async () => {
  const { json } = await call('GET', '/api/projects?page=0&pageSize=9999', null, writerToken);
  assert.strictEqual(json.data.page, 1);
  assert.strictEqual(json.data.pageSize, 100);
});

test('作品列表支持关键词搜索与状态筛选', async () => {
  const { json } = await call('GET', '/api/projects?q=雾港', null, writerToken);
  assert.ok(json.data.list.length >= 1);
  assert.ok(json.data.list.every((p) => p.title.includes('雾港') || p.genre.includes('雾港') || p.logline.includes('雾港')));
  const { json: j2 } = await call('GET', '/api/projects?status=reviewing', null, writerToken);
  assert.ok(j2.data.list.every((p) => p.status === 'reviewing'));
});

// ———————————— 作品完整结构 ————————————

test('作品完整结构返回 分集→场景→对白 三级嵌套', async () => {
  const { json } = await call('GET', '/api/projects?pageSize=100', null, writerToken);
  projectId = json.data.list.find((p) => p.title === '雾港').id;
  const { status, json: full } = await call('GET', `/api/projects/${projectId}/full`, null, writerToken);
  assert.strictEqual(status, 200);
  assert.strictEqual(full.data.episodes.length, 3, '每部作品 3 分集');
  const totalScenes = full.data.episodes.reduce((n, e) => n + e.scenes.length, 0);
  assert.strictEqual(totalScenes, 12, '每集 4 场景 × 3 集');
  const firstScene = full.data.episodes[0].scenes[0];
  assert.ok(Array.isArray(firstScene.dialogues));
  assert.ok(firstScene.dialogues.length > 0, '首场应有对白');
  assert.ok(firstScene.dialogues[0].character_name, '对白应带角色名');
  assert.ok(full.data.stats.words > 0);
  sceneId = firstScene.id;
  episodeId = full.data.episodes[0].id;
});

// ———————————— 越权 ————————————

test('writer 创建自己的作品成功', async () => {
  const { status, json } = await call('POST', '/api/projects', { title: '测试作品', type: '小说', genre: '都市' }, writerToken);
  assert.strictEqual(status, 201);
  assert.strictEqual(json.data.status, 'draft', '新作品默认 draft');
});

test('editor 不能修改 writer 的作品（返回 403）', async () => {
  const { status } = await call('PUT', `/api/projects/${projectId}`, { title: '篡改标题' }, editorToken);
  assert.strictEqual(status, 403, '责编只能审阅，不能替编剧改稿');
});

test('editor 可以读取 writer 的作品（审阅所需）', async () => {
  const { status, json } = await call('GET', `/api/projects/${projectId}/full`, null, editorToken);
  assert.strictEqual(status, 200);
  assert.strictEqual(json.data.project.title, '雾港');
});

test('另一个 writer 无法读取他人作品详情（返回 403）', async () => {
  const username = uniq();
  const reg = await call('POST', '/api/auth/register', { username, password: 'pass1234' });
  const other = reg.json.data.token;
  const { status } = await call('GET', `/api/projects/${projectId}`, null, other);
  assert.strictEqual(status, 403);
});

// ———————————— 状态机 ————————————

test('作品合法流转：draft → reviewing', async () => {
  const create = await call('POST', '/api/projects', { title: '状态机测试', type: '电影' }, writerToken);
  const id = create.json.data.id;
  const { status, json } = await call('PATCH', `/api/projects/${id}/status`, { status: 'reviewing' }, writerToken);
  assert.strictEqual(status, 200);
  assert.strictEqual(json.data.status, 'reviewing');
});

test('作品非法流转被拒绝：draft → approved（返回 400）', async () => {
  const create = await call('POST', '/api/projects', { title: '非法流转测试', type: '电影' }, writerToken);
  const id = create.json.data.id;
  const { status, json } = await call('PATCH', `/api/projects/${id}/status`, { status: 'approved' }, editorToken);
  assert.strictEqual(status, 400, 'draft 不能直接跳到 approved');
  assert.match(json.message, /非法状态流转/);
});

test('作品未知状态值被拒绝（返回 400）', async () => {
  const { status } = await call('PATCH', `/api/projects/${projectId}/status`, { status: 'published' }, adminToken);
  assert.strictEqual(status, 400);
});

test('writer 不能自己把作品标为过审（返回 403）', async () => {
  const create = await call('POST', '/api/projects', { title: '越权过审测试', type: '电影' }, writerToken);
  const id = create.json.data.id;
  await call('PATCH', `/api/projects/${id}/status`, { status: 'reviewing' }, writerToken);
  const { status } = await call('PATCH', `/api/projects/${id}/status`, { status: 'approved' }, writerToken);
  assert.strictEqual(status, 403, '过审是责编权限');
});

test('场景合法流转：outline → drafted', async () => {
  const create = await call('POST', '/api/scenes', { episode_id: episodeId, title: '新场景', status: 'outline' }, writerToken);
  const id = create.json.data.id;
  const { status, json } = await call('PATCH', `/api/scenes/${id}/status`, { status: 'drafted' }, writerToken);
  assert.strictEqual(status, 200);
  assert.strictEqual(json.data.status, 'drafted');
});

test('场景非法流转被拒绝：final → outline（返回 400）', async () => {
  // 自建一个走到 final 的场景，避免依赖其它用例留下的状态。
  const created = await call('POST', '/api/scenes', { episode_id: episodeId, title: '定稿场景' }, writerToken);
  const id = created.json.data.id;
  await call('PATCH', `/api/scenes/${id}/status`, { status: 'drafted' }, writerToken);
  await call('PATCH', `/api/scenes/${id}/status`, { status: 'revised' }, writerToken);
  const toFinal = await call('PATCH', `/api/scenes/${id}/status`, { status: 'final' }, writerToken);
  assert.strictEqual(toFinal.json.data.status, 'final');
  const { status } = await call('PATCH', `/api/scenes/${id}/status`, { status: 'outline' }, writerToken);
  assert.strictEqual(status, 400, 'final 不能直接回到 outline');
});

// ———————————— 审阅台 ————————————

test('writer 访问审阅台返回 403', async () => {
  const { status } = await call('GET', '/api/review/queue', null, writerToken);
  assert.strictEqual(status, 403);
});

test('editor 可看到待审队列，通过后作品状态变为 approved', async () => {
  const { status, json } = await call('GET', '/api/review/queue?status=reviewing', null, editorToken);
  assert.strictEqual(status, 200);
  assert.ok(json.data.total >= 1, '种子作品「雾港」在待审中');
  const target = json.data.list[0];
  assert.ok(target.author_name, '应带作者信息');
  const decide = await call('POST', `/api/review/${target.id}/decision`, { decision: 'approve', comment: '结构完整，可以立项。' }, editorToken);
  assert.strictEqual(decide.status, 200);
  assert.strictEqual(decide.json.data.project.status, 'approved');
  assert.ok(decide.json.data.note_id, '审阅意见应落库为笔记');
});

test('审阅返修会写入一条 todo 笔记', async () => {
  const create = await call('POST', '/api/projects', { title: '待返修作品', type: '网剧' }, writerToken);
  const id = create.json.data.id;
  await call('PATCH', `/api/projects/${id}/status`, { status: 'reviewing' }, writerToken);
  const { status, json } = await call('POST', `/api/review/${id}/decision`, { decision: 'revise', comment: '第二幕冲突不足。' }, editorToken);
  assert.strictEqual(status, 200);
  assert.strictEqual(json.data.project.status, 'revising');
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(json.data.note_id);
  assert.strictEqual(note.kind, 'todo');
  assert.match(note.content, /第二幕冲突不足/);
});

// ———————————— 角色与关系 ————————————

test('角色列表返回 8 个种子角色并带关系', async () => {
  const { status, json } = await call('GET', '/api/characters?pageSize=100', null, writerToken);
  assert.strictEqual(status, 200);
  assert.strictEqual(json.data.total, 8);
  assert.ok(json.data.list.some((c) => c.relations.length > 0), '至少一个角色带关系');
});

test('关系图接口返回节点与边', async () => {
  const { status, json } = await call('GET', `/api/characters/relations?project_id=${projectId}`, null, writerToken);
  assert.strictEqual(status, 200);
  assert.strictEqual(json.data.nodes.length, 4, '「雾港」有 4 个角色');
  assert.strictEqual(json.data.edges.length, 5, '「雾港」有 5 条关系');
  assert.ok(json.data.edges[0].from_name && json.data.edges[0].relation);
});

test('不能给自己建立关系（返回 400）', async () => {
  const { json } = await call('GET', `/api/characters?project_id=${projectId}`, null, writerToken);
  const c = json.data.list[0];
  const { status } = await call('POST', '/api/characters/relations', { from_id: c.id, to_id: c.id, relation: '自我' }, writerToken);
  assert.strictEqual(status, 400);
});

// ———————————— 故事线 ————————————

test('故事线列表含关联场景与完整性判定', async () => {
  const { status, json } = await call('GET', `/api/storylines?pageSize=50`, null, writerToken);
  assert.strictEqual(status, 200);
  assert.strictEqual(json.data.total, 3, '3 条种子故事线');
  const main = json.data.list.find((l) => l.kind === 'main' && l.project_id === projectId);
  assert.ok(main.scene_count >= 3);
  assert.ok(Array.isArray(main.issues));
  assert.strictEqual(typeof main.complete, 'boolean');
});

test('关联场景到故事线后场景数增加', async () => {
  const { json } = await call('GET', `/api/storylines?project_id=${projectId}`, null, writerToken);
  const line = json.data.list.find((l) => l.code === 'B');
  const before = line.scene_count;
  const scene = db.prepare('SELECT id FROM scenes WHERE project_id = ? AND id NOT IN (SELECT scene_id FROM storyline_scenes WHERE storyline_id = ?) LIMIT 1').get(projectId, line.id);
  if (!scene) return;
  const { status } = await call('POST', `/api/storylines/${line.id}/scenes`, { scene_id: scene.id }, writerToken);
  assert.strictEqual(status, 201);
  const { json: after } = await call('GET', `/api/storylines?project_id=${projectId}`, null, writerToken);
  const updated = after.data.list.find((l) => l.id === line.id);
  assert.strictEqual(updated.scene_count, before + 1);
});

// ———————————— 版本快照 ————————————

test('创建快照 → 对比 → 回滚全流程可用', async () => {
  // 用自建场景，避免与其它用例共享状态。
  const created = await call('POST', '/api/scenes', { episode_id: episodeId, title: '快照测试场景' }, writerToken);
  const sid = created.json.data.id;

  const put1 = await call('PUT', `/api/scenes/${sid}`, { content: '改写后的正文内容。' }, writerToken);
  assert.strictEqual(put1.status, 200, '场景应可保存');
  const snap1 = await call('POST', `/api/scenes/${sid}/revisions`, { summary: '改写版本' }, writerToken);
  assert.strictEqual(snap1.status, 201);
  const v = snap1.json.data.version;

  await call('PUT', `/api/scenes/${sid}`, { content: '再改一次，完全不同。' }, writerToken);
  const snap2 = await call('POST', `/api/scenes/${sid}/revisions`, { summary: '第二次改写' }, writerToken);
  const v2 = snap2.json.data.version;
  assert.ok(v2 > v, '版本号应递增');

  const cmp = await call('GET', `/api/scenes/${sid}/revisions/compare?a=${v}&b=${v2}`, null, writerToken);
  assert.strictEqual(cmp.status, 200);
  assert.ok(cmp.json.data.changed_count >= 1, 'content 应有差异');
  assert.ok(cmp.json.data.fields.some((f) => f.field === 'content' && f.changed));

  const rb = await call('POST', `/api/scenes/${sid}/revisions/${v}/rollback`, null, writerToken);
  assert.strictEqual(rb.status, 200);
  assert.strictEqual(rb.json.data.content, '改写后的正文内容。');
  assert.strictEqual(rb.json.data.rolled_back_to, v);

  // 快照列表包含回滚前自动快照
  const list = await call('GET', `/api/scenes/${sid}/revisions`, null, writerToken);
  assert.ok(list.json.data.revisions.length >= 3);
});

test('对比不存在的版本返回 404', async () => {
  const { status } = await call('GET', `/api/scenes/${sceneId}/revisions/compare?a=1&b=999`, null, writerToken);
  assert.strictEqual(status, 404);
});

test('无权用户不能为他人场景创建快照（返回 403）', async () => {
  const username = uniq();
  const reg = await call('POST', '/api/auth/register', { username, password: 'pass1234' });
  const { status } = await call('POST', `/api/scenes/${sceneId}/revisions`, { summary: 'x' }, reg.json.data.token);
  assert.strictEqual(status, 403);
});

// ———————————— AI（降级本地规则，带 source）————————————

test('AI 角色生成写入 characters 表（source=local）', async () => {
  const before = db.prepare('SELECT COUNT(*) AS c FROM characters WHERE project_id = ?').get(projectId).c;
  const { status, json } = await call('POST', '/api/ai/character-gen', { project_id: projectId, hint: '退役的潜水员' }, writerToken);
  assert.strictEqual(status, 200);
  assert.strictEqual(json.data.source, 'local', '未配置 Key 应降级');
  assert.ok(json.data.character.id, '应返回落库后的角色');
  assert.ok(json.data.character.name);
  const after = db.prepare('SELECT COUNT(*) AS c FROM characters WHERE project_id = ?').get(projectId).c;
  assert.strictEqual(after, before + 1, '角色必须写入 characters 表');
});

test('AI 对白润色返回建议（source=local）', async () => {
  const { status, json } = await call('POST', '/api/ai/polish-dialogue', { line: '你到底在查什么？', character_name: '林晚', emotion: '追问' }, writerToken);
  assert.strictEqual(status, 200);
  assert.strictEqual(json.data.source, 'local');
  assert.ok(json.data.text.includes('林晚'));
});

test('AI 对白润色缺少 line 返回 400', async () => {
  const { status } = await call('POST', '/api/ai/polish-dialogue', {}, writerToken);
  assert.strictEqual(status, 400);
});

test('AI 情节建议返回冲突与转折建议（source=local）', async () => {
  const { status, json } = await call('POST', '/api/ai/plot-suggest', { project_id: projectId }, writerToken);
  assert.strictEqual(status, 200);
  assert.strictEqual(json.data.source, 'local');
  assert.match(json.data.text, /冲突升级/);
});

test('AI 逻辑检查结果写入 notes 待办（source=local）', async () => {
  const before = db.prepare("SELECT COUNT(*) AS c FROM notes WHERE source = 'ai'").get().c;
  const { status, json } = await call('POST', '/api/ai/logic-check', { project_id: projectId }, writerToken);
  assert.strictEqual(status, 200);
  assert.strictEqual(json.data.source, 'local');
  assert.ok(Array.isArray(json.data.issues));
  assert.ok(json.data.notes.length > 0, '检查结果必须写入创作笔记');
  const after = db.prepare("SELECT COUNT(*) AS c FROM notes WHERE source = 'ai'").get().c;
  assert.ok(after > before, 'notes 表应新增 AI 待办');
  assert.ok(json.data.notes.every((n) => n.kind === 'todo' && n.source === 'ai' && n.status === 'open'));
});

test('AI 逻辑检查对无权作品返回 403', async () => {
  const username = uniq();
  const reg = await call('POST', '/api/auth/register', { username, password: 'pass1234' });
  const { status } = await call('POST', '/api/ai/logic-check', { project_id: projectId }, reg.json.data.token);
  assert.strictEqual(status, 403);
});

// ———————————— 种子数据厚度 ————————————

test('种子数据厚度满足要求', () => {
  // 用例本身会注册账号、建作品，所以这里用 >= 校验种子下限，
  // 并单独校验种子账号确实存在。
  const c = (sql) => db.prepare(sql).get().c;
  assert.ok(c('SELECT COUNT(*) AS c FROM users') >= 3, '至少 3 个种子账号');
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS c FROM users WHERE username IN ('admin','writer1','editor1')").get().c, 3);
  assert.ok(c('SELECT COUNT(*) AS c FROM projects') >= 2);
  assert.ok(c('SELECT COUNT(*) AS c FROM episodes') >= 6);
  assert.ok(c('SELECT COUNT(*) AS c FROM scenes') >= 24);
  assert.ok(c('SELECT COUNT(*) AS c FROM characters') >= 8, 'AI 角色生成用例会新增角色');
  assert.strictEqual(c('SELECT COUNT(*) AS c FROM character_relations'), 10);
  assert.strictEqual(c('SELECT COUNT(*) AS c FROM dialogues'), 30);
  assert.strictEqual(c('SELECT COUNT(*) AS c FROM storylines'), 3);
  assert.ok(c('SELECT COUNT(*) AS c FROM revisions') >= 8);
  assert.ok(c('SELECT COUNT(*) AS c FROM notes') >= 10);
});

test('种子数据跨至少 7 个日期', () => {
  const rows = db.prepare("SELECT DISTINCT substr(created_at,1,10) AS d FROM scenes").all();
  const days = new Set(rows.map((r) => r.d));
  assert.ok(days.size >= 7, `场景创建日期应跨 ≥7 天，实际 ${days.size} 天`);
});

test('数据表数量满足要求（≥12 张业务表）', () => {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  const names = rows.map((r) => r.name);
  const expected = ['users', 'projects', 'episodes', 'scenes', 'characters', 'character_relations',
    'scene_characters', 'dialogues', 'storylines', 'storyline_scenes', 'notes', 'revisions'];
  expected.forEach((t) => assert.ok(names.includes(t), `缺少表 ${t}`));
  assert.ok(names.length >= 12);
});
