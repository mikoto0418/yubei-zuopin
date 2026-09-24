#!/usr/bin/env node
// 生成器：读一份 project.config.mjs，产出一个完整可跑的项目骨架。
// 用法：node _pipeline/scaffold.mjs _pipeline/projects/<name>.config.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
if (!args.length) {
  console.error('用法：node _pipeline/scaffold.mjs _pipeline/projects/<name>.config.mjs');
  process.exit(1);
}

const configPath = path.resolve(ROOT, args[0]);
const mod = await import(pathToFileURL(configPath).href);
const cfg = mod.default;
if (!cfg || !cfg.key) {
  console.error('配置文件必须 default export 一个含 key 的对象');
  process.exit(1);
}

const dest = path.join(ROOT, cfg.key);
if (fs.existsSync(dest) && !args.includes('--force')) {
  console.error(`目录已存在：${dest}\n加 --force 覆盖（会先备份）。`);
  process.exit(1);
}

// ---------- 小工具 ----------
const write = (rel, content) => {
  const p = path.join(dest, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
};
const copyDir = (src, dst) => {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
};
const readTemplate = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

// ---------- 1. 复制内核 ----------
fs.mkdirSync(dest, { recursive: true });
copyDir(path.join(__dirname, 'kernel', 'node', 'src'), path.join(dest, 'backend', 'src'));
copyDir(path.join(__dirname, 'kernel', 'node', 'test'), path.join(dest, 'backend', 'test'));
fs.copyFileSync(path.join(__dirname, 'kernel', 'node', 'index.js'), path.join(dest, 'backend', 'kernel.js'));

// 内核依赖放进 backend/package.json
const pkg = JSON.parse(readTemplate('kernel/node/package.template.json'));
pkg.name = `${cfg.key}-backend`;
pkg.description = `${cfg.name} - 后端 API`;
pkg.scripts.start = 'node server.js';
write('backend/package.json', JSON.stringify(pkg, null, 2) + '\n');

// ---------- 2. 后端：db.js ----------
const userExtraCols = (cfg.userColumns || []).map((c) => `  ${c.name} ${c.type}${c.default !== undefined ? ` DEFAULT ${c.default}` : ''}`).join(',\n');
const entityTables = (cfg.entities || []).map((e) => {
  const cols = e.columns.map((c) => `  ${c.name} ${c.type}${c.default !== undefined ? ` DEFAULT ${c.default}` : ''}`).join(',\n');
  const fk = e.owner !== false ? `,\n  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE` : '';
  return `CREATE TABLE IF NOT EXISTS ${e.table} (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n${cols}${fk}\n);`;
}).join('\n\n');

write('backend/db.js', `// ${cfg.name} 数据层：建表 + 迁移 + 索引 + 幂等种子。
'use strict';
require('dotenv').config();
const path = require('path');
const { openDatabase, addColumn, ensureIndexes } = require('./kernel').db;
const { hashPassword } = require('./kernel').auth;

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', '${cfg.key}.db');
const db = openDatabase(DB_PATH);

db.exec(\`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  nickname TEXT DEFAULT '',
  avatar TEXT DEFAULT ''${userExtraCols ? ',\n' + userExtraCols : ''},
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

${entityTables}
\`);

${(cfg.migrations || []).map((m) => `addColumn(db, '${m.table}', '${m.column}');`).join('\n') || '// 无额外迁移'}

ensureIndexes(db, \`
${(cfg.indexes || []).map((i) => `CREATE INDEX IF NOT EXISTS ${i};`).join('\n')}
\`);

// 种子：管理员 + 演示账号 + 演示业务数据（幂等，已有用户即跳过）
function seedIfNeeded() {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (c > 0) return;
  const insUser = db.prepare('INSERT INTO users (username, password, role, nickname${(cfg.userColumns || []).length ? ',' + cfg.userColumns.map((x) => x.name).join(',') : ''}) VALUES (${Array(4 + (cfg.userColumns || []).length).fill('?').join(',')})');
  const adminId = insUser.run('admin', hashPassword('admin123'), 'admin', '管理员'${(cfg.userColumns || []).map((x) => `, ${JSON.stringify(x.demoAdmin ?? '')}`).join('')}).lastInsertRowid;
${(cfg.accounts?.demo || []).map((a) => `  insUser.run('${a.username}', hashPassword('${a.password}'), 'user', '${a.nickname}'${(cfg.userColumns || []).map((x) => `, ${JSON.stringify(a[x.name] ?? '')}`).join('')});`).join('\n')}

${cfg.seedCode || '  // 业务演示数据由各系统在 seed.js 中补充'}

  console.log('[seed] 已创建 admin 与演示账号');
}

// 模块加载即确保种子存在：测试与 server 都依赖 admin 账号，放在这里避免遗漏。
seedIfNeeded();

module.exports = { db, seedIfNeeded, DB_PATH };
`);

// ---------- 3. 后端：seed.js ----------
write('backend/seed.js', `// 独立种子脚本：node seed.js
'use strict';
const { seedIfNeeded } = require('./db');
seedIfNeeded();
console.log('[seed] 完成');
`);

// ---------- 4. 后端：server.js ----------
// 客户端可写字段：排除主键、归属列、时间戳与只读列。
// user_id 由后端从 JWT 注入，created_at 由数据库默认值生成，都不该由客户端提交。
const OWNER_COL = (e) => (e.owner === false ? null : 'user_id');
const writableFields = (e) => e.columns
  .filter((c) => !c.readonly)
  .map((c) => c.name)
  .filter((n) => n !== 'id' && n !== OWNER_COL(e) && n !== 'created_at' && n !== 'updated_at');
const numberFields = (e) => writableFields(e).filter((n) => {
  const col = e.columns.find((c) => c.name === n);
  return col && /INT|REAL|NUM/.test(col.type);
});

const routeMounts = (cfg.entities || []).map((e) => `  // ${e.label}
  app.use(\`\${api}/entities/${e.table}\`, requireAuth, crudRoutes({
    db, table: '${e.table}',
    fields: ${JSON.stringify(writableFields(e))},
    required: ${JSON.stringify(e.required || [])},
    searchable: ${JSON.stringify(e.searchable || [])},
    filterable: ${JSON.stringify(e.filterable || [])},
    ownerColumn: ${e.owner === false ? 'null' : "'user_id'"},
    numberFields: ${JSON.stringify(numberFields(e))},
  }));`).join('\n\n');

// ---------- 5. 后端：overview + ai ----------
write('backend/overview.js', `// Admin 概览的业务指标。内核已提供 users 计数，这里补充本系统的统计。
'use strict';
module.exports = (db) => () => {
  const one = (sql, ...a) => { try { return db.prepare(sql).get(...a)?.c || 0; } catch { return 0; } };
  return {
${(cfg.entities || []).map((e) => `    ['${e.table}_total']: one('SELECT COUNT(*) AS c FROM ${e.table}'),`).join('\n')}
  };
};
`);

// 注意：localBody 里禁止声明名为 req / res / input 的变量——
// 它们与路由处理器的参数同名会触发 TDZ 报错。请用业务语义命名（如 requirement、text）。
(cfg.ai?.routes || []).forEach((r) => {
  write(`backend/ai/${r.path}.js`, `// ${r.label}：配置了 LLM_API_KEY 走大模型，否则本地规则降级。
'use strict';
const { ok, fail } = require('../src/http');
const ai = require('../src/ai');

module.exports = (db) => async (req, res) => {
  try {
    const input = req.body || {};
${r.localBody || "    const buildLocal = () => '本地规则占位输出';"}
    const result = await ai.generate(
      [{ role: 'system', content: ${JSON.stringify(r.system || '你是一个助手。')} }, { role: 'user', content: JSON.stringify(input) }],
      buildLocal,
      { temperature: ${r.temperature ?? 0.7} }
    );
    return ok(res, { text: result.text, source: result.source });
  } catch (e) {
    return fail(res, 500, 'AI 服务异常：' + e.message);
  }
};
`);
});

// ---------- 6. 测试 ----------
write('backend/test/app.test.js', `// 复用内核测试套件，只替换装配函数。
'use strict';
const { runCoreSuite } = require('./core.test');
const { createApp } = require('../kernel').server;
const { mountRoutes } = require('../routes');

runCoreSuite({ createApp, mountRoutes, port: ${cfg.port + 1000} });
`);

// routes.js 导出 mountRoutes，供 server.js 与测试共用
write('backend/routes.js', `// 抽出挂载函数，使 server.js 与测试共用同一套路由装配。
'use strict';
const { authRoutes, adminRoutes, crudRoutes, requireAuth } = require('./kernel');
const { db } = require('./db');

function mountRoutes(app, api) {
  app.use(\`\${api}/auth\`, authRoutes({ db, extraColumns: ${JSON.stringify((cfg.userColumns || []).map((c) => c.name))} }));
  app.use(\`\${api}/admin\`, adminRoutes({ db, buildOverview: require('./overview')(db) }));
${routeMounts.replace(/crudRoutes\(\{/g, 'crudRoutes({')}

${cfg.extraRoutes || '  // 领域专属路由'}

${(cfg.ai?.routes || []).map((r) => `  app.post(\`\${api}/ai/${r.path}\`, requireAuth, require('./ai/${r.path}')(db));`).join('\n') || '  // 无 AI 路由'}
}

module.exports = { mountRoutes };
`);

// server.js 只写一次，通过 routes.js 装配
write('backend/server.js', `// ${cfg.name} 服务入口。
'use strict';
require('dotenv').config();
const { createApp, start } = require('./kernel').server;
const { mountRoutes } = require('./routes');
const { seedIfNeeded } = require('./db');

seedIfNeeded();

const app = createApp({ mountRoutes });
const PORT = process.env.PORT || ${cfg.port};
start(app, PORT, '${cfg.name}');

module.exports = { app };
`);

// ---------- 7. 配置与脚本 ----------
write('.env.example', `# ${cfg.name} 配置示例。复制为 .env 后按需修改。
SECRET_KEY=change-me-to-a-random-string
JWT_SECRET=change-me-too
PORT=${cfg.port}

# 可选：配置后 AI 走真实大模型，留空则用本地规则降级
LLM_API_KEY=
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
`);

write('.gitignore', `node_modules/
dist/
*.db
*.db-shm
*.db-wal
.env
.DS_Store
*.log
__pycache__/
.venv/
`);

write('start.sh', `#!/usr/bin/env bash
# ${cfg.name} 一键启动（单端口生产模式）：装依赖 → 构建前端 → 初始化数据 → 启动后端
set -e
cd "$(dirname "$0")"
step() { echo; printf '\\033[1;36m>>> %s\\033[0m\\n' "$1"; }

step '1/4 安装后端依赖'
[ -d backend/node_modules ] || (cd backend && npm install)

step '2/4 安装前端依赖'
[ -d frontend/node_modules ] || (cd frontend && npm install)

step '3/4 构建前端产物'
(cd frontend && npm run build)

step '4/4 初始化数据并启动（端口 ${cfg.port}）'
(cd backend && npm run seed && npm start)
`);

write('start.bat', `@echo off
REM ${cfg.name} 一键启动（Windows）
cd /d "%~dp0"
if not exist backend\\node_modules (cd backend && call npm install)
if not exist frontend\\node_modules (cd frontend && call npm install)
cd frontend && call npm run build && cd ..
cd backend && call npm run seed && call npm start
`);

write('verify.sh', `#!/usr/bin/env bash
# ${cfg.name} 验证：后端测试 → 前端构建 → 接口冒烟。全部通过才算交付合格。
set -e
cd "$(dirname "$0")"
PASS=0; FAIL=0
step() { echo; printf '\\033[1;36m>>> %s\\033[0m\\n' "$1"; }

step '1/3 后端核心链路测试'
if (cd backend && npm test); then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo '❌ 后端测试失败'; fi

step '2/3 前端构建'
if (cd frontend && npm run build); then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo '❌ 前端构建失败'; fi

step '3/3 接口冒烟'
(cd backend && node server.js &) ; sleep 4
H=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:${cfg.port}/api/auth/me || echo 000)
echo "GET /api/auth/me -> $H (期望 401)"
[ "$H" = "401" ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo '❌ 冒烟失败'; }
PID=$(netstat -ano 2>/dev/null | grep ':${cfg.port} ' | grep LISTENING | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID "$PID" >/dev/null 2>&1 || true

echo; echo "========== 结果：通过 $PASS 项，失败 $FAIL 项 =========="
[ "$FAIL" = "0" ] && echo '✅ 全部通过' || { echo '❌ 存在失败项'; exit 1; }
`);

console.log(`✅ 骨架已生成：${dest}`);
console.log(`   下一步：cd ${cfg.key} && bash start.sh`);
console.log(`   前端骨架需按 forms/${cfg.form} 填充（见 _pipeline/README.md）`);
