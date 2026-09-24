# ScriptForge · 剧本 / 小说创作工作台

> 一个把「作品 → 分集 → 场景 → 对白」四级结构、角色关系网络、故事线完整性、
> 版本快照与责编审阅流程装进同一张米色稿纸里的创作工具。

---

## 1. 这是什么

ScriptForge 面向**影视编剧与长篇小说作者**，解决三件事：

1. **结构管理** —— 一部长片或一季网剧有几十场戏，散在文档里就丢了全局。这里用
   作品 → 分集 → 场景的树状结构 + 故事线完整性检查，让作者随时知道"哪条线断了"。
2. **人物管理** —— 角色不是一份名单，而是一张关系网。角色卡（身份 / 性格 / 目标 / 弧光）
   与可视化的关系图放在一起，写对白时右侧常驻速查。
3. **协作闭环** —— 编剧写、责编审。责编能读全部作品但不能改稿；审阅意见落成待办，
   编剧逐条勾掉后重新送审。

---

## 2. 技术栈

| 层 | 选型 |
|---|---|
| 后端 | Node.js + Express 4 + better-sqlite3（WAL）+ JWT + bcrypt |
| 前端 | Vue 3（`<script setup>`）+ Vite 5 + vue-router 4 + Arco Design Vue 2 |
| 设计 | Apple 设计语言基底（`apple-tokens.css`）+ 纸张质感 / 衬线正文差异化 |
| AI | OpenAI 兼容接口，未配置 Key 自动降级本地规则引擎，响应带 `source` |
| 测试 | `node --test`（内置测试运行器），45 个用例 |

---

## 3. 快速开始

### 一键启动（推荐，生产单端口模式）

```bash
# macOS / Linux / Git Bash
./start.sh

# Windows
start.bat
```

脚本会依次：安装后端依赖 → 安装前端依赖 → 构建前端产物 → 初始化数据 → 启动服务。

打开 <http://localhost:4204>。

### 开发模式（前后端分离，热更新）

```bash
# 终端 1：后端（4204）
cd backend && npm install && npm run seed && npm start

# 终端 2：前端（5204，已配置 /api 代理到 4204）
cd frontend && npm install && npm run dev
```

打开 <http://localhost:5204>。

### 演示账号

| 用户名 | 密码 | 角色 | 能看到什么 |
|---|---|---|---|
| `admin` | `admin123` | 管理员 | 全部作品 + 审阅台 + 管理概览 |
| `writer1` | `writer123` | 编剧 | 自己的 2 部作品，可写作、送审 |
| `editor1` | `editor123` | 责编 | 全部作品（只读）+ 审阅台，可通过 / 返修 |

---

## 4. 目录结构

```
scriptforge/
├── start.sh / start.bat          一键启动（生产模式）
├── verify.sh                     验证：后端测试 → 前端构建 → 接口冒烟
├── DESIGN.md                     设计说明（含"为什么用衬线正文"）
├── README.md                     本文件
├── backend/
│   ├── package.json
│   ├── server.js                 服务入口（端口 4204）
│   ├── kernel.js                 内核统一出口
│   ├── src/                      内核实现
│   │   ├── auth.js               JWT + RBAC 中间件
│   │   ├── db.js                 连接 / 迁移 / 分页助手
│   │   ├── http.js               统一响应 {code,data,message} / 分页 / 校验
│   │   ├── server.js             Express 应用工厂 + 静态托管 + SPA 兜底
│   │   ├── ai.js                 LLM 调用 + 本地降级
│   │   ├── admin.js              Admin 概览 / 用户列表
│   │   ├── crud.js               通用 CRUD（内核版）
│   │   └── routes/auth.js        认证路由
│   ├── db.js                     12 张业务表 + 索引 + 状态机定义
│   ├── access.js                 三角色读写权限判定
│   ├── crud.js                   ScriptForge 版 CRUD（支持 derive / afterWrite）
│   ├── routes.js                 路由装配
│   ├── seed.js                   幂等种子数据
│   ├── overview.js               Admin 概览业务指标
│   ├── test/app.test.js          45 个用例
│   └── data/scriptforge.db       SQLite 数据文件（首次运行自动生成）
└── frontend/
    ├── package.json
    ├── vite.config.js            端口 5204 + /api 代理
    ├── index.html
    └── src/
        ├── main.js               Arco 全量注册 + 中文语言包
        ├── App.vue               根组件
        ├── api.js                请求封装（sf_token / sf_user，401 自动登出）
        ├── store.js              登录态 composable（角色判定）
        ├── constants.js          状态机 / 类型 / 题材 / 关系 / 笔记类型常量
        ├── apple-tokens.css      Apple 设计令牌（共享层）
        ├── styles/global.css     全局样式 + 纸张 / 衬线差异化
        ├── router/index.js       路由 + 登录守卫 + 角色守卫
        ├── layouts/AppShell.vue  侧边导航外壳
        ├── components/
        │   ├── StateBlock.vue    五态容器（加载 / 空 / 错误 / 无权限 / 就绪）
        │   └── StatusBadge.vue   状态徽章
        └── views/                11 个页面
            ├── LoginView.vue         登录 / 注册
            ├── ProjectsView.vue      作品列表（卡片网格）
            ├── StudioView.vue        创作工作台（三栏，核心页）
            ├── CharactersView.vue    角色管理 + SVG 关系图
            ├── DialoguesView.vue     对白编辑 + 导出剧本
            ├── StorylinesView.vue    故事线 + 完整性检查
            ├── RevisionsView.vue     版本历史 + 对比 + 回滚
            ├── NotesView.vue         创作笔记
            ├── ReviewView.vue        审阅台（editor / admin）
            ├── AdminView.vue         管理概览（admin）
            ├── ForbiddenView.vue     403
            └── NotFoundView.vue      404
```

---

## 5. 数据模型

12 张业务表，全部启用外键级联删除（`PRAGMA foreign_keys = ON`）。

```
users ─┬─ projects ─┬─ episodes ─── scenes ─┬─ dialogues
       │            │                      ├─ scene_characters ─┐
       │            │                      └─ revisions         │
       │            ├─ characters ─────────┴─ character_relations
       │            ├─ storylines ─── storyline_scenes ── scenes
       │            └─ notes
```

| 表 | 关键字段 | 说明 |
|---|---|---|
| `users` | `role` | admin / writer / editor |
| `projects` | `type` `genre` `logline` `status` | 一部作品 |
| `episodes` | `seq` | 分集 / 章节，有序 |
| `scenes` | `location` `time_of_day` `content` `status` `word_count` | 场景 |
| `characters` | `identity` `personality` `goal` `arc` | 角色卡 |
| `character_relations` | `from_id` `to_id` `relation` | 有向关系 |
| `scene_characters` | `scene_id` `character_id` | 出场角色（唯一约束） |
| `dialogues` | `line` `emotion` `seq` | 对白 |
| `storylines` | `code` `kind` | A/B/C 线，main / sub |
| `storyline_scenes` | `storyline_id` `scene_id` | 关联（唯一约束） |
| `notes` | `kind` `status` `source` | 灵感 / 设定 / 参考 / 待办 |
| `revisions` | `version` `snapshot` | 场景 JSON 快照 |

---

## 6. 状态机

### 作品

```
draft ──→ reviewing ──→ approved ──→ archived
  ↑           │  ↑          │            │
  │           ↓  │          ↓            │
  └──────  revising ────────┘            │
  └──────────────────────────────────────┘
```

| 当前 | 可流转到 |
|---|---|
| `draft` 草稿 | reviewing、archived |
| `reviewing` 送审中 | revising、approved、draft |
| `revising` 返修中 | reviewing、approved、draft |
| `approved` 已过审 | archived、revising |
| `archived` 已归档 | draft |

### 场景

| 当前 | 可流转到 |
|---|---|
| `outline` 大纲 | drafted |
| `drafted` 初稿 | revised、outline |
| `revised` 修订 | final、drafted |
| `final` 定稿 | revised |

**非法流转一律返回 400**，前端只把合法目标渲染进下拉框，双重保障。

---

## 7. API 一览

统一响应结构：`{ code, data, message }`，成功 `code = 0`。
鉴权：`Authorization: Bearer <token>`。

### 认证

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | 注册（默认 writer，可选 editor；不能自封 admin） |
| POST | `/api/auth/login` | 登录，返回 token + user |
| GET | `/api/auth/me` | 当前用户 |
| PUT | `/api/auth/me` | 改昵称 / 头像 / 简介 |

### 通用实体（分页 + 搜索 + 筛选）

`/api/projects`、`/api/episodes`、`/api/scenes`、`/api/dialogues`、`/api/notes`
均支持 `?page=&pageSize=&q=&<字段>=`，并具备完整 CRUD。

`/api/characters`、`/api/storylines` 的**列表接口被领域路由覆盖**（带关系 / 关联场景与完整性）。

### 领域接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects/:id/full` | 作品完整结构（分集 → 场景 → 对白 + 角色 + 故事线 + 统计） |
| PATCH | `/api/projects/:id/status` | 作品状态流转（状态机校验） |
| PATCH | `/api/scenes/:id/status` | 场景状态流转 |
| GET | `/api/characters?project_id=` | 角色列表（含关系） |
| GET | `/api/characters/relations?project_id=` | 关系图数据（nodes + edges） |
| POST | `/api/characters/relations` | 新建关系 |
| DELETE | `/api/characters/relations/:id` | 删除关系 |
| GET | `/api/storylines?project_id=` | 故事线（含关联场景 + 完整性 issues） |
| POST | `/api/storylines/:id/scenes` | 关联场景 |
| DELETE | `/api/storylines/:id/scenes/:sceneId` | 取消关联 |
| POST | `/api/scenes/:id/revisions` | 创建快照 |
| GET | `/api/scenes/:id/revisions` | 快照列表 |
| GET | `/api/scenes/:id/revisions/compare?a=&b=` | 逐字段对比 |
| POST | `/api/scenes/:id/revisions/:version/rollback` | 回滚 |
| GET | `/api/review/queue?status=` | 待审队列（editor / admin） |
| POST | `/api/review/:id/decision` | 通过 / 返修（editor / admin） |
| GET | `/api/admin/overview` | 13 项业务指标（admin） |
| GET | `/api/admin/users` | 账号列表（admin） |

### AI

| 方法 | 路径 | 落库 |
|---|---|---|
| POST | `/api/ai/character-gen` | **写入 `characters`** |
| POST | `/api/ai/polish-dialogue` | 否 |
| POST | `/api/ai/plot-suggest` | 否 |
| POST | `/api/ai/logic-check` | **写入 `notes`（待办）** |

全部响应带 `source: 'llm' | 'local'`。

---

## 8. 权限模型

| 角色 | 读 | 写 | 审阅 |
|---|---|---|---|
| `admin` | 全部 | 全部 | ✅ |
| `editor` 责编 | **全部作品** | 只有自己的 | ✅ |
| `writer` 编剧 | 只有自己的 | 只有自己的 | ❌ |

- 越权读 / 写他人资源 → **403**
- 未登录 → **401**（前端自动清除登录态并跳转登录页）
- writer 尝试 `approved` / `revising` 流转 → **403**
- writer 访问 `/api/review/queue` → **403**

前端的路由守卫与 `AppShell` 菜单同步这套权限：非 editor/admin 看不到「审阅台」，
非 admin 看不到「管理概览」。

---

## 9. AI 降级机制

`backend/src/ai.js` 暴露 `generate(messages, buildLocal, opts)`：

1. 若配置了 `LLM_API_KEY`，先尝试调用 OpenAI 兼容的 `/chat/completions`；
2. 调用失败（网络 / 超时 / 空返回）→ 打 `console.warn`，**自动降级**；
3. 未配置 Key 直接走本地规则；
4. 两种情况都返回 `{ text, source }`，前端在抽屉里明确标注引擎来源。

本地规则引擎实现：

- **角色卡生成**：按提示词与已有角色数生成结构化 JSON（姓名 / 年龄 / 身份 / 性格 / 目标 / 弧光）；
- **对白润色**：去句尾标点、补情绪提示、给三条润色要点；
- **情节建议**：基于场景数与故事线数量给冲突升级 / 转折点建议；
- **逻辑检查**：三类启发式检查（时段-地点跳变、角色长时间缺席、场景无出场角色）。

---

## 10. 验证

```bash
./verify.sh
```

依次执行：

1. **后端测试** —— `node --test`，45 个用例，覆盖：

   | 类别 | 用例数 | 覆盖点 |
   |---|---|---|
   | 鉴权 | 8 | 注册默认角色、不能自封 admin、重复用户名 409、弱密码 400、401、种子账号登录 |
   | 分页 / 搜索 / 筛选 | 4 | 分页结构、page=999 边界、pageSize 夹到 100、q + status 筛选 |
   | 作品结构 | 1 | 三级嵌套、对白带角色名、统计正确 |
   | 越权 | 4 | writer 建作品、editor 不能改他人作品（403）、editor 能读（200）、他人 writer 读 403 |
   | 状态机 | 6 | 作品合法 / 非法 / 未知状态、writer 不能过审、场景合法 / 非法流转 |
   | 审阅台 | 3 | writer 403、通过后 approved、返修写入 todo 笔记 |
   | 角色与关系 | 3 | 8 个角色带关系、关系图 nodes/edges、不能自连 |
   | 故事线 | 2 | 完整性判定、关联场景后计数增加 |
   | 版本快照 | 3 | 创建 → 对比 → 回滚全流程、对比不存在版本 404、无权创建 403 |
   | AI 降级 | 6 | 角色生成落库、润色、缺参数 400、情节建议、逻辑检查落库、无权 403 |
   | 种子厚度 | 3 | 各表计数、跨 ≥7 日期、表数量 ≥12 |
   | 兜底 | 2 | Admin 403 / 200、API 404 返回 JSON |

2. **前端构建** —— `vite build`，零错误；
3. **接口冒烟** —— 启动服务，`GET /api/auth/me` 期望 401。

输出 `✅ 全部通过` 即交付合格。

---

## 11. 环境变量

复制 `.env.example` 为 `backend/.env`（可选，全部有默认值）：

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `4204` | 后端端口 |
| `DB_PATH` | `backend/data/scriptforge.db` | SQLite 文件路径 |
| `JWT_SECRET` | 未配置则生成进程级随机密钥 | 生产环境务必显式配置 |
| `TOKEN_TTL` | `7d` | token 有效期 |
| `LLM_API_KEY` | 空 | 配置后启用大模型，否则走本地规则 |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI 兼容端点 |
| `LLM_MODEL` | `gpt-4o-mini` | 模型名 |
| `LLM_TIMEOUT` | `20000` | 调用超时（毫秒） |

> 未配置 `JWT_SECRET` 时会生成进程级随机密钥（不落盘），重启后旧 token 失效 ——
> 这是为了避免用固定默认值导致越权，生产部署请显式配置。

---

## 附：常见问题

**Q：端口被占用怎么办？**
A：改 `.env` 里的 `PORT`（后端）与 `frontend/vite.config.js` 的 `server.port` 和
代理 `target`（前端）。

**Q：想重新灌一遍种子数据？**
A：删掉 `backend/data/scriptforge.db*` 三个文件，重新 `npm run seed`。

**Q：测试为什么不污染数据？**
A：`test/app.test.js` 在加载模块前就把 `DB_PATH` 指向 `data/scriptforge-test.db`
并删除同名 `-wal` / `-shm`，每轮测试都从干净库开始。

**Q：AI 功能没反应？**
A：未配置 `LLM_API_KEY` 时会走本地规则引擎 —— 这是**预期行为**，功能照常可用，
结果抽屉里会显示「引擎：本地规则（未配置 Key 自动降级）」。
