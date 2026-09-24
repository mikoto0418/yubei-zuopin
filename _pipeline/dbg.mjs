#!/usr/bin/env node
// 调试：检查 mindcare 登录态为何没生效
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9555;
const profile = mkdtempSync(join(tmpdir(), 'dbg-'));
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--headless=new', '--no-first-run', '--disable-gpu', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 40; i++) { await sleep(500);
  try { const j = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); wsUrl = j.webSocketDebuggerUrl; if (wsUrl) break; } catch {} }

const tgt = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });

await send('Page.enable'); await send('Runtime.enable');
async function goto(u) { await send('Page.navigate', { url: u }); await sleep(2500); }
async function ev(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.result?.value; }

await goto('http://localhost:4101/');
console.log('1) 源码里的 key 用法：');
console.log(await ev(`(() => {
  const html = document.documentElement.outerHTML;
  return { hasLoginForm: html.includes('用户名') || html.includes('密码'), ls: Object.keys(localStorage) };
})()`));

// 登录并写 localStorage
console.log('2) 登录：');
console.log(await ev(`(async () => {
  const r = await fetch('http://localhost:4101/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:'xiaolan',password:'xiaolan123'}) });
  const j = await r.json();
  const token = j.token || j.data?.token;
  const user = j.user || j.data?.user;
  localStorage.setItem('mc_token', token);
  localStorage.setItem('mc_user', JSON.stringify(user));
  return { ok: !!token, keys: Object.keys(localStorage), tokenLen: token.length };
})()`));

await goto('http://localhost:4101/');
await sleep(2000);
console.log('3) 重新加载后：');
console.log(await ev(`({
  ls: Object.keys(localStorage),
  lsVals: Object.fromEntries(Object.entries(localStorage).map(([k,v]) => [k, String(v).slice(0,40)])),
  hasLoginForm: document.documentElement.outerHTML.includes('演示账号'),
  hash: location.hash,
  bodyLen: document.body.innerText.length,
  bodyHead: document.body.innerText.slice(0,120)
})`));

ws.close(); try { chrome.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {}
