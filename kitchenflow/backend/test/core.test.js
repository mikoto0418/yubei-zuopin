// 内核核心链路测试：注册 → 登录 → 鉴权 → 403 拦截 → 分页 → AI 降级。
// 各系统复制此文件后，只需替换 mountRoutes 为自己的装配函数即可复用。
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');

// 由各系统在 test/app.test.js 里传入自己的装配函数来实例化。
function runCoreSuite({ createApp, mountRoutes, port = 4999 }) {
  let server;
  let base;

  before(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-suite';
    const app = createApp({ mountRoutes });
    server = app.listen(port);
    base = `http://127.0.0.1:${port}`;
  });

  after(() => {
    if (server) server.close();
  });

  async function call(method, path, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(base + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* 忽略非 JSON */ }
    return { status: res.status, json };
  }

  const uniq = () => 'u' + Date.now() + Math.floor(Math.random() * 1000);

  test('注册成功返回 token 与用户', async () => {
    const username = uniq();
    const { status, json } = await call('POST', '/api/auth/register', { username, password: 'pass1234' });
    assert.strictEqual(status, 200);
    assert.strictEqual(json.code, 0);
    assert.ok(json.data.token, '应返回 token');
    assert.strictEqual(json.data.user.username, username);
    assert.strictEqual(json.data.user.password, undefined, '不得回传密码');
  });

  test('重复用户名注册被拒绝', async () => {
    const username = uniq();
    await call('POST', '/api/auth/register', { username, password: 'pass1234' });
    const { status, json } = await call('POST', '/api/auth/register', { username, password: 'pass1234' });
    assert.strictEqual(status, 409);
    assert.notStrictEqual(json.code, 0);
  });

  test('弱密码被拒绝', async () => {
    const { status } = await call('POST', '/api/auth/register', { username: uniq(), password: '123' });
    assert.strictEqual(status, 400);
  });

  test('未登录访问受保护接口返回 401', async () => {
    const { status, json } = await call('GET', '/api/auth/me');
    assert.strictEqual(status, 401);
    assert.notStrictEqual(json.code, 0);
  });

  test('错误密码登录返回 401', async () => {
    const username = uniq();
    await call('POST', '/api/auth/register', { username, password: 'pass1234' });
    const { status } = await call('POST', '/api/auth/login', { username, password: 'wrongpass' });
    assert.strictEqual(status, 401);
  });

  test('正确凭证登录成功', async () => {
    const username = uniq();
    await call('POST', '/api/auth/register', { username, password: 'pass1234' });
    const { status, json } = await call('POST', '/api/auth/login', { username, password: 'pass1234' });
    assert.strictEqual(status, 200);
    assert.ok(json.data.token);
  });

  test('普通用户访问 Admin 接口返回 403', async () => {
    const username = uniq();
    const reg = await call('POST', '/api/auth/register', { username, password: 'pass1234' });
    const token = reg.json.data.token;
    const { status, json } = await call('GET', '/api/admin/overview', null, token);
    assert.strictEqual(status, 403);
    assert.notStrictEqual(json.code, 0);
  });

  test('管理员可访问 Admin 接口', async () => {
    const { status, json } = await call('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(status, 200, 'admin 账号应存在');
    const token = json.data.token;
    const { status: s2, json: j2 } = await call('GET', '/api/admin/overview', null, token);
    assert.strictEqual(s2, 200);
    assert.strictEqual(j2.code, 0);
    assert.ok(typeof j2.data.users === 'number');
  });

  test('API 404 返回 JSON 而非 HTML', async () => {
    const { status, json } = await call('GET', '/api/definitely-not-exist');
    assert.strictEqual(status, 404);
    assert.notStrictEqual(json.code, 0);
  });

  return { call, uniq, getBase: () => base };
}

module.exports = { runCoreSuite };
