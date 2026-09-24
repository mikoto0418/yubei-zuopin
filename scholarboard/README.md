# ScholarBoard · 学生智能工作台

一块让学生高效打理**笔记、项目、简历、任务**的智能工作台。Vue 3 前端 + Node.js/Express 后端，SQLite 存储，全站中文。

> **Apple 设计基底**：SF Pro / 苹方无衬线体系，系统色 `--orange` `#FF9500` 为主题色，圆角按令牌档位，卡片无边框 + 极浅阴影，支持深色模式。
> **差异化记忆点**：⌘/Ctrl + K 命令面板 + 三栏工作区，全站键盘驱动。

---

## ✨ 功能一览

| 模块 | 说明 |
| ---- | ---- |
| **账号系统** | 注册 / 登录 / 退出；`user` 与 `admin` 两种角色；JWT 认证；个人中心可改昵称与头像 |
| **笔记管理** | CRUD、标签、收藏、项目归属、服务端分页 / 搜索 / 只看收藏筛选；浏览器原生**语音转文字**与**语音朗读** |
| **笔记版本历史** | 每次保存自动生成快照（**保留最近 20 版**）；行级 diff 对比（对比当前 / 对比上一版）与**一键回滚**（回滚前自动备份） |
| **项目分组** | 笔记与任务归属到项目；项目带颜色（Apple 系统色）与归档态；卡片展示关联计数 |
| **标签体系** | 标签与笔记多对多；**标签云**按使用次数调整字号与浓度，点标签展开该标签下的笔记 |
| **活动流** | 记录创建 / 编辑 / 删除 / 完成 / 润色 / 应用 / 回滚 / 状态变更，首页时间线按类型着色展示 |
| **简历工作台** | 结构化经历（机构 / 角色 / 起止 / 描述 / 亮点），**支持拖拽排序**；`draft → polished → final` 状态机，**定稿后锁定编辑** |
| **AI 落库闭环** | 一键润色 → 正文写入 `resumes.polished` + 亮点写入 `resume_experiences.highlights` + 自动流转 `draft → polished`；**一键应用**回原稿 |
| **任务看板** | 增删改、优先级、截止日期、按项目分列、拖拽跨列改归属、标记完成 |
| **Admin 仪表盘** | 仅管理员可进入；9 张指标卡 + 折线 / 柱状 / 环形图（ECharts）：笔记趋势、任务完成度、简历状态分布、活跃度趋势、活跃用户 Top |

---

## 🛠 技术栈

- **后端**：Node.js + Express，SQLite（`better-sqlite3`），`bcryptjs` 密码哈希，`jsonwebtoken` JWT 认证
- **前端**：Vue 3 + Vite + Naive UI 2，`ECharts` 图表，`vue-router`
- **测试**：Node 内置 `node:test`（无需额外测试框架）
- 语言：全站中文界面；代码与文档默认 UTF-8

---

## 🗄 数据模型（11 张表）

```
users              用户（含角色 / 昵称 / 头像字符）
projects           项目分组（名称 / 颜色 / 描述 / 归档态）
notes              笔记（标题 / 正文 / 标签冗余串 / 收藏 / 项目归属）
note_versions      笔记版本快照（保留最近 20 版）
tags               标签（用户维度唯一）
note_tags          标签-笔记多对多关联
resumes            简历（技能 / 状态机 / 润色稿 / 定稿时间）
resume_experiences 结构化经历（机构 / 角色 / 起止 / 描述 / 亮点数组 / 排序）
tasks              任务（优先级 / 截止日期 / 完成态 / 项目归属）
attachments        附件元数据
activities         活动流（类型 / 目标 / 摘要 / meta）
```

**简历状态机**：`draft → polished → final`。非法流转返回 `400`；`final` 锁定编辑，允许回退 `polished` 解锁。

---

## 📁 目录结构

```
scholarboard/
├── backend/
│   ├── src/
│   │   ├── app.js         # Express 应用（全部路由 + 统一响应 + 校验 + 全局异常 + 静态托管）
│   │   ├── server.js      # 启动入口（默认端口 4102）
│   │   ├── db.js          # SQLite 建表（11 张）+ 旧库列迁移
│   │   ├── seed.js        # 幂等种子数据（4 账号 + 加厚演示数据，跨 ≥14 天）
│   │   ├── middleware.js  # JWT 签发、认证、管理员 RBAC
│   │   ├── http.js        # 统一响应 ok/fail + 分页参数解析
│   │   └── ai.js          # AI 润色 / 结构化亮点 / 学习周报（LLM 真实调用 / 本地保底降级）
│   ├── test/app.test.js   # 28 个核心链路接口测试（node:test）
│   ├── data/              # SQLite 数据库文件（运行时生成，不入库）
│   ├── .env.example       # 环境变量模板
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── main.js / router.js / api.js
│   │   ├── apple-tokens.css       # Apple 设计令牌层（唯一令牌源）
│   │   ├── theme.js               # 令牌 → Naive UI themeOverrides（浅色 / 深色两套）
│   │   ├── bus.js                 # 极简事件总线（命令面板 → 各功能页意图投递）
│   │   ├── layout/AppLayout.vue   # 毛玻璃顶栏 + 命令入口 + 导航
│   │   ├── components/
│   │   │   ├── CommandPalette.vue # ⌘K 命令面板
│   │   │   ├── StateBlock.vue     # 五态统一封装（加载/空/错误/无权限/404）
│   │   │   ├── Markdown.vue / Modal.vue / ConfirmModal.vue
│   │   ├── views/
│   │   │   ├── Login.vue          # 登录 / 注册（含演示账号快填）
│   │   │   ├── Home.vue           # 活动流时间线
│   │   │   ├── Notes.vue          # 三栏编辑器（笔记树 / 编辑器 / 属性标签）
│   │   │   ├── Projects.vue       # 项目列表
│   │   │   ├── Tags.vue           # 标签云
│   │   │   ├── Versions.vue       # 版本历史（diff + 回滚）
│   │   │   ├── Resumes.vue        # 简历工作台（结构化经历 + 状态机 + 应用润色）
│   │   │   ├── Tasks.vue          # 任务看板
│   │   │   ├── Dashboard.vue      # Admin 数据仪表盘
│   │   │   ├── Profile.vue / NotFound.vue / Forbidden.vue
│   │   └── assets/base.css        # 跨页排版助手 + Naive UI 局部校准
│   ├── vite.config.js             # 开发代理 /api -> 后端 4102，dev 端口 5172
│   └── package.json
├── start.ps1 / start.sh / start.bat   # 一键启动（生产单端口模式）
├── verify.sh                      # 一键验证（后端测试 → 前端构建 → 接口冒烟）
├── DESIGN.md                      # 前端设计文档（含三个批次改造记录与自检）
└── README.md
```

---

## 🚀 启动方式

### 方式 A：一键启动（推荐，单端口生产模式）

Windows（PowerShell）：
```powershell
.\start.ps1
```
Linux / macOS：
```bash
chmod +x start.sh && ./start.sh
```
脚本会自动：安装依赖 → 构建前端 → 初始化演示数据 → 启动后端。完成后访问 **http://localhost:4102**。

### 方式 B：前后端分离开发（推荐日常开发）

**1. 启动后端（端口 4102）**
```bash
cd backend
npm install
cp .env.example .env        # Windows: copy .env.example .env  （按需修改）
npm run seed                # 幂等初始化数据库与演示数据
npm start                   # http://localhost:4102
```

**2. 启动前端（端口 5172）**
```bash
cd frontend
npm install
npm run dev                 # Vite 开发服务器，浏览器打开 http://localhost:5172
```
前端已配置代理：`/api` 请求自动转发到 `http://localhost:4102`。

---

## 🧪 运行测试

后端核心链路测试（单独临时数据库，不影响开发数据）：
```bash
cd backend
npm test
```

**28 个用例，全部通过**，覆盖：

| 分组 | 用例 |
| --- | --- |
| 基础与认证 | 健康检查、注册成功 / 参数校验 400 / 重复 409、登录密码错误 401 |
| 权限 | 未登录 401、普通用户访问 Admin 403、管理员 200 且统计口径扩展 |
| 笔记 | CRUD 与搜索、标题为空 400 |
| **笔记版本** | 每次保存生成快照、diff 有增删行、回滚生效、回滚本身留快照、**越权访问他人版本 404** |
| 项目 | 创建 / 归档筛选 / **重名 409** / 删除 |
| **标签** | 多对多关联自动建标签、**按标签筛选**（`/tags/:id/notes` 与 `?tag=`）、重名 409、删除 |
| 分页 | pageSize 边界裁剪到 100、total 一致、**页码越界返回空数组** |
| **简历状态机** | `draft→polished→final` 合法流转、`finalized_at` 落库、回退解锁 |
| **状态机非法流转** | `draft→final` 返回 400 且提示「非法状态流转」、未知状态 400 |
| **定稿锁定** | 定稿后改标题 / 加经历均返回 400 且提示「锁定」 |
| **结构化经历** | CRUD、详情按 sort_order 返回、**拖拽排序生效**、排序列表不匹配 400 |
| **AI 降级与落库** | 未配置 key 返回 `source: local`；简历润色写入 `polished` + 亮点落库 + 自动流转 `draft→polished`；一键应用回原稿；未润色就应用 400 |
| 任务 | CRUD、完成态切换、非法优先级 400 |
| 活动流 | 关键操作被记录、按类型筛选 |
| **越权** | 他人笔记读写删 404、他人任务修改 404 |
| 其他 | 未知接口 404 统一响应 |
| **种子厚度** | 11 张表均有数据，且活动流跨 ≥14 天 |

---

## 🔑 默认账号

| 角色 | 用户名 | 密码 | 说明 |
| ---- | ------ | ---- | ---- |
| 管理员 | `admin` | `admin123` | 可进入数据仪表盘 |
| 普通用户 | `alice` `bob` `carol` | `123456` | 演示账号，可自由操作 |

> 注册接口对所有开放（后端 `/api/auth/register`），新用户自动为 `user` 角色。

---

## 🌱 种子数据规模

| 表 | 条数 | 说明 |
| --- | --- | --- |
| users | 4 | admin + alice / bob / carol |
| projects | 6 | 数据结构课程 / 实习求职 / 科研入门 / 雅思备考 / 助教工作 / 毕业设计 |
| notes | 25 | 覆盖 4 个账号的真实学习笔记 |
| note_versions | 40 | 前 15 篇各 2 版 + 后 10 篇各 1 版 |
| tags | 15 | 算法 / 图论 / 求职 / 英语 / 深度学习… |
| note_tags | 35 | 标签-笔记关联 |
| resumes | 8 | 覆盖 draft / polished / final 三种状态 |
| resume_experiences | 20 | 结构化经历（含 AI 亮点） |
| tasks | 35 | 覆盖高 / 中 / 低优先级与完成态 |
| attachments | 10 | 附件元数据 |
| activities | 30 | **跨最近 14 天**，时间线有真实厚度 |

---

## 🤖 AI 能力与配置

后端 `backend/.env` 中填写（`cp .env.example .env` 后修改）。若配置了 **`LLM_API_KEY`**，
则调用兼容 OpenAI 的 `POST {LLM_BASE_URL}/chat/completions`；若**未配置** key 或调用失败，
则自动降级返回**本地保底结果**（响应 `source: local`），离线也能完整演示。

```ini
LLM_BASE_URL=https://api.openai.com/v1   # 兼容接口根地址
LLM_API_KEY=sk-XXXXXXXXXXXXXXXX          # 你的密钥
LLM_MODEL=gpt-4o-mini                    # 使用的模型名
```

| AI 功能 | 落库位置 |
| --- | --- |
| 简历润色正文 | `resumes.polished` |
| 简历结构化亮点 | `resume_experiences.highlights`（并驱动状态机 `draft → polished`） |
| 一键应用到原稿 | `resume_experiences.description` |
| 通用文本润色 | 不落库，直接返回（仅记录活动流） |
| 学习周报 | 不落库，直接返回（仅记录活动流） |

配置完重启后端即可。未配置 key 时前端会提示「来源：本地兜底（未配置 LLM_API_KEY）」。

---

## 🌐 语音功能说明

- **语音转文字**：浏览器原生 `SpeechRecognition`（Chrome / Edge）。笔记编辑器点击「语音输入」即可口述转文字（中文）。
- **语音朗读**：`speechSynthesis` 朗读笔记 / 简历 / 任务。
- 这些为浏览器端能力，无需后端；个别浏览器不支持时界面会给出降级提示。

---

## 🎨 设计基底

前端统一使用 `src/apple-tokens.css` 提供的 Apple 设计令牌：

- **字体**：`-apple-system / SF Pro / 苹方`；字号严格按 Apple HIG 阶梯（Large Title 34 / Title 2 22 / Headline 17 / Body 17 / Subhead 15 / Footnote 13 / Caption 12）
- **主题色**：系统色 `--orange` `#FF9500`，其余颜色仅用于语义（成功 / 警告 / 错误 / 信息）
- **圆角**：`8 / 12 / 16 / 22 / 999` 五档
- **卡片**：无边框 + 极浅双档阴影；**毛玻璃仅用于悬浮层**（顶栏、命令面板、弹窗）
- **分隔线**：1px 发丝线，只出现在列表项之间
- **深色模式**：跟随 `prefers-color-scheme`，深浅两套令牌 + Naive UI `darkTheme`，切换无闪烁
- **动效**：统一 `cubic-bezier(0.4,0,0.2,1)`，并在 `prefers-reduced-motion: reduce` 下全部降级

---

## 🔒 统一接口约定

后端所有接口返回统一结构 `{ code, data, message }`：
- 成功：`code = 0`，`data` 为载荷。
- 失败：`code` 为 HTTP 状态码（如 400 / 401 / 403 / 404 / 409 / 500），`message` 为明确中文错误。
- 列表接口内置 `page` / `pageSize` / `q`（搜索）及各自筛选参数，分页元数据（`total`）随载荷返回。
- 资源归属校验：所有写操作都带 `user_id` 约束，跨用户访问返回 `404`（不泄露资源存在性）。
- Admin 接口经 `auth + adminOnly` 双重校验，普通用户访问一律返回 `403`。
- 未知 API 返回 `404`；请求体非合法 JSON 返回 `400`。

---

## 🔒 安全与工程约定

- `.gitignore` 已忽略 `node_modules`、`dist`、`*.db*`、`.env`、日志文件。
- `JWT_SECRET`（别名 `SECRET_KEY`）、`LLM_API_KEY` 等敏感项一律走环境变量（`.env.example` 提供模板，`.env` 不入库），不硬编码进源码。
- 未配置 `JWT_SECRET` 时生成**进程级随机密钥**（不落盘），避免固定默认值导致越权；重启后旧 token 失效。
- 密码使用 `bcryptjs` 哈希存储。
- `seed` 幂等：重复执行不会重复插入、也不会清空用户已有数据。
- 活动流写入包裹 `try/catch`，日志失败不影响业务主流程。

---

## ✅ 已验证

一键跑完整验证（后端测试 → 前端构建 → 接口冒烟）：

```bash
./verify.sh
```

当前结果：**通过 10 项，失败 0 项**。

- 后端 `npm test` **28/28 全绿**（含版本回滚、状态机非法流转、定稿锁定、越权、标签筛选、分页边界、AI 降级与落库）。
- 真实 HTTP smoke 通过：项目分组（含 note_count / task_count）、标签云（含 count）、活动流时间线、笔记列表、笔记版本历史、简历结构化经历。
- 前端 `npm run build` **零错误**，构建产物由后端静态托管（单端口 4102）。
- 种子数据 11 张表全部达标且跨 ≥14 天。

## License

MIT（学生课程作品项目）。
