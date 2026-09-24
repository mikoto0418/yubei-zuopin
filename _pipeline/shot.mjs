#!/usr/bin/env node
// 独立 Chrome 实例 + CDP 截图：不依赖任何被占用的浏览器会话
// 用法：node _pipeline/shot.mjs <url> <out.png> [loginApi] [user] [pass] [tokenKey] [userKey] [targetPath]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const [url, out, loginApi, username, password, tokenKey, userKey, targetPath] = process.argv.slice(2);
if (!url || !out) { console.error('usage: node shot.mjs <url> <out.png> [loginApi user pass tokenKey userKey targetPath]'); process.exit(1); }

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333 + Math.floor(Math.random() * 200);
const profile = mkdtempSync(join(tmpdir(), 'shot-'));
const W = 1440, H = 900;

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--headless=new',
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--hide-scrollbars', '--disable-extensions',
  `--window-size=${W},${H}`,
  'about:blank',
], { stdio: 'ignore', detached: false });

function cleanup(code) {
  try { chrome.kill(); } catch {}
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(code);
}

// 等 CDP 端口就绪
let wsUrl = null;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    const j = await r.json();
    wsUrl = j.webSocketDebuggerUrl;
    if (wsUrl) break;
  } catch {}
}
if (!wsUrl) { console.error('CDP 未就绪'); cleanup(1); }

// 建一个页面级 target
const tgt = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const pageWs = tgt.webSocketDebuggerUrl;

const ws = new WebSocket(pageWs);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
const events = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method) events.push(m);
};
function send(method, params = {}) {
  const mid = ++id;
  return new Promise((res) => { pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

async function goto(u) {
  await send('Page.navigate', { url: u });
  for (let i = 0; i < 60; i++) {
    await sleep(400);
    const r = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
    if (r.result?.result?.value === 'complete') break;
  }
  await sleep(1200);
}
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { err: r.result.exceptionDetails.text };
  return r.result?.result?.value;
}

// 1) 先到目标 origin（localStorage 是按 origin 隔离的）
// 服务监听 0.0.0.0(IPv4)，headless Chrome 可能把 localhost 解析到 ::1 而连不上，
// 统一改用 127.0.0.1。
const origin = new URL(url).origin.replace('localhost', '127.0.0.1');
await goto(origin + '/');

// 2) 若有登录信息，先走 API 拿 token，再写入 localStorage
if (loginApi && username) {
  let res = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    res = await evalJs(`(async () => {
      try {
        const r = await fetch(${JSON.stringify(origin + loginApi)}, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: ${JSON.stringify(username)}, password: ${JSON.stringify(password)} })
        });
        const j = await r.json();
        const d = j.data || j;
        const token = d.token || j.token;
        const user = d.user || j.user;
        if (token) localStorage.setItem(${JSON.stringify(tokenKey || 'token')}, token);
        if (user) localStorage.setItem(${JSON.stringify(userKey || 'user')}, JSON.stringify(user));
        return { ok: !!token, keys: Object.keys(j) };
      } catch (e) { return { err: String(e && e.message || e) }; }
    })()`);
    if (res && res.ok) break;
    await sleep(1200);
  }
  console.log('login:', JSON.stringify(res));
}

// 3) 到目标页并截图
// 先强制重载一次：hash 路由项目（如 ExamPrep 的 /#/calendar）改 hash 不触发页面重载，
// 应用不会重新读取刚写入的 token，会停在登录页。
if (loginApi && username) {
  await goto('about:blank');
}
await goto(origin + (targetPath || '/'));
// 等页面内容真正渲染出来（SPA 首屏可能较慢）
for (let i = 0; i < 30; i++) {
  await sleep(500);
  const len = await evalJs('document.body.innerText.length');
  if (typeof len === 'number' && len > 300) break;
}
await sleep(1500);
const info = await evalJs('({ title: document.title, href: location.href, bodyLen: document.body.innerText.length })');
console.log('page:', JSON.stringify(info));

const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
if (shot.result?.data) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log('saved:', out);
} else {
  console.error('截图失败', JSON.stringify(shot).slice(0, 300));
  cleanup(1);
}
ws.close();
cleanup(0);
