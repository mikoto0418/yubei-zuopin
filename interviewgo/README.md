# InterviewGo

## 项目简介

InterviewGo 是一款 AI 模拟面试陪练应用：选定岗位与级别后，由 AI 面试官逐题提问并追问，用户用自然语言回答。每轮回答都会做**要点命中分析**，结束后生成结构化评估报告、**技能雷达**与**弱项练习计划**，形成完整闭环。

一句话记忆点：**核心体验就是一个对话界面**——只有气泡，没有卡片；连评分报告都以气泡形式内嵌在对话流里。

前端统一采用 **Apple 设计语言基底**（共享令牌层 `apple-tokens.css`），主题色 `--purple #AF52DE`，支持深色模式自动切换。

## 核心功能

### 对话即产品（差异化维度）

对话页只有左右两栏：左侧是可收起的会话列表（新建 / 搜索 / 状态筛选 / 加载更多），右侧是全屏对话区。AI 气泡用填充色底、用户气泡用主题色实底白字——**只有气泡，没有卡片**，这是与其它系统并排时的辨识点。

### 流式打字机输出

AI 回复逐字追加呈现（`setInterval` 每约 16ms 推进一步，长文本自动加大步长），尾部带闪烁光标；打字结束后才把完整内容落库。提供"跳过打字动画"按钮，请求等待期间显示三点思考指示器并区分阶段文案。

### 岗位库

6 个预置岗位（前端 / 后端 / 算法 / 产品 / 数据 / 测试开发），每个岗位带**技能标签**与**考察维度**，支持自建岗位。新建面试会话时从岗位库选择，自动带出岗位名、级别与建议标题。

### 题库

40 道内置题，按 **岗位 × 分类（技术 / 行为 / 情景，共 12 个分类）× 难度** 组织，支持筛选、搜索与自建题（增删改）。内置题任何人可读但不可修改，自建题仅本人可改删。

### 多轮面试与答案分析

每轮回答后调用 `POST /api/ai/analyze-answer`，AI 给出**要点命中 / 遗漏**分析，写入 `answer_analyses`；同时把该轮的技术准确度、表达清晰度、专业深度三项评分写入 `interview_rounds`。面试详情页按轮次展示命中（绿）与遗漏（橙）标签。

### 技能雷达

评分经 `POST /api/reports/:sessionId/skills` 写入 `skill_assessments`，按维度落库（逻辑性 / 专业深度 / 表达力 / 技术准确度 / 工程实践）。`GET /api/skill-radar` 按 `dimension_key` 聚合，前端用**纯 SVG** 手绘雷达图（零图表库），并给出综合评分、最强与最弱维度。

### 弱项练习计划（自动生成 → 执行 → 回写）

`POST /api/ai/practice-plan` 读取低于 75 分阈值的维度，从题库挑选推荐题目、计算建议时长，**自动写入 `practice_plans`**。用户在练习计划页执行（进度 ±20%、开始执行、标记完成），进度回写驱动状态机 `pending → in_progress → done`。

**关键闭环**：`skill_assessments`（评分落库）→ 驱动 `practice_plans`（自动生成）→ 用户执行 → 回写进度。

### 状态机

会话状态机在后端 `db.js` 中定义为唯一权威，所有流转经 `POST /api/sessions/:id/transition` 校验，**非法流转返回 400**：

```
created ──▶ in_progress ──▶ completed ──▶ evaluated
```

练习计划同样有状态机：`pending ──▶ in_progress ──▶ done`（跳级被拒）。

### 其它

语音输入（浏览器原生 `SpeechRecognition`）、消息复制与重新生成、Markdown 轻量渲染（零依赖，先转义再解析避免 XSS）、每页五态齐全（加载 / 空 / 错误 / 无权限 / 404）、深色模式跟随系统且无闪烁。

## 技术栈

### 前端

- React 18 + Vite 5
- MUI v7（`createTheme` 深度适配 Apple 基底：`shape.borderRadius: 12`、Apple 字体栈与 HIG 字号阶梯、阴影只留 2 档）
- react-router-dom 6
- `apple-tokens.css` 共享设计令牌层
- 开发端口 5203，`/api` 代理到后端 4203；localStorage 前缀 `ig_`

### 后端

- Node.js + Express 4
- better-sqlite3（同步 SQLite，WAL 模式）
- jsonwebtoken + bcryptjs（JWT 鉴权、密码哈希）
- 生产端口 4203，单端口同时提供 API 与前端构建产物

## 数据表（11 张）

| 表 | 说明 |
| --- | --- |
| `users` | 用户（admin / user 角色） |
| `job_positions` | 岗位库（技能标签、考察维度，支持自建） |
| `question_categories` | 题目分类（技术 / 行为 / 情景） |
| `question_bank` | 题库（参考答案、关键要点、难度，支持自建） |
| `interview_sessions` | 面试会话（**状态机**：created → in_progress → completed → evaluated） |
| `interview_rounds` | 多轮面试轮次（技术准确度 / 表达清晰度 / 深度三项评分） |
| `messages` | 对话消息（`card_type` 区分普通文本 / AI 来源 / 报告卡片） |
| `reports` | 评估报告（总分 + 三维度 + 建议 + `source`） |
| `skill_assessments` | **技能雷达**多维度评分落库 |
| `practice_plans` | **弱项练习计划**（推荐题目、建议时长、进度、状态） |
| `answer_analyses` | **答案要点分析**（命中 / 遗漏要点、点评） |

## 目录结构

```
interviewgo/
├── DESIGN.md                    # 前端设计文档（Apple 基底 + 差异化实现）
├── README.md
├── start.sh / start.bat         # 一键启动
├── verify.sh                    # 验证：后端测试 → 前端构建 → 接口冒烟
├── .env.example
├── backend/
│   ├── server.js                # 服务入口
│   ├── routes.js                # 路由装配：auth / admin / entities / bank / sessions / skill-radar / ai
│   ├── db.js                    # 11 张表 + 迁移 + 索引 + 幂等种子 + 状态机定义
│   ├── seed.js                  # 独立种子脚本
│   ├── kernel.js                # 内核聚合导出
│   ├── overview.js              # Admin 概览统计（含领域指标）
│   ├── domain/
│   │   └── scoring.js           # 答案要点评分（AI 分析与轮次评分共用口径）
│   ├── ai/
│   │   ├── ask.js               # AI 出题（优先从题库抽题）
│   │   ├── evaluate.js          # AI 评估报告（轮次评分参与计算）
│   │   ├── analyze-answer.js    # 答案要点分析 → answer_analyses
│   │   └── practice-plan.js     # 弱项练习计划 → practice_plans
│   ├── src/                     # 内核：auth / crud / ai / http / db / admin
│   ├── test/
│   │   ├── core.test.js         # 可复用核心链路测试套件（10 项）
│   │   ├── app.test.js          # 本系统装配入口
│   │   └── domain.test.js       # 领域测试（状态机 / 越权 / 雷达 / 计划 / 分页 / 降级）
│   └── data/                    # SQLite 数据文件
└── frontend/
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── main.jsx / App.jsx / api.js / theme.js
        ├── apple-tokens.css     # Apple 设计令牌层
        ├── index.css
        ├── context/             # AuthContext / ChatContext / SnackbarContext
        ├── components/          # AppShell / MessageBubble / ReportCard / SkillRadar /
        │                        # Markdown / Composer / SessionList / SessionDialog /
        │                        # RouteGuards / States
        └── pages/               # Chat / Positions / Questions / Plans / Radar /
                                 # SessionDetail / Login / History / Admin /
                                 # Forbidden / NotFound
```

## 快速开始

### 一键启动（推荐）

```bash
bash start.sh
```

脚本依次执行：安装后端依赖 → 安装前端依赖 → 构建前端产物 → 初始化数据并启动服务（端口 4203）。Windows 下可用 `start.bat`。

启动后访问 <http://localhost:4203>。

### 手动分步

```bash
# 1. 安装后端依赖
cd backend && npm install

# 2. 安装前端依赖
cd ../frontend && npm install

# 3. 构建前端产物
npm run build

# 4. 初始化数据并启动（端口 4203）
cd ../backend && npm run seed && npm start
```

前端独立开发模式（带热更新与 `/api` 代理）：

```bash
cd frontend && npm run dev
```

## 演示账号

首次启动时 `db.js` 会自动写入以下账号与业务数据（幂等，已有数据即跳过）：

| 用户名 | 密码 | 角色 | 昵称 |
| --- | --- | --- | --- |
| `admin` | `admin123` | 管理员 | 管理员 |
| `candidate` | `candidate123` | 普通用户 | 张同学 |
| `jobseeker` | `jobseeker123` | 普通用户 | 刘同学 |

种子数据规模：**6 个岗位、12 个题目分类、40 道题、8 场会话**（覆盖全部 4 种状态，跨 7 个以上日期）、对应的轮次 / 消息 / 报告 / 技能评分 / 练习计划 / 答案分析。

## 测试

```bash
cd backend && npm test
```

**共 32 项用例**，全部通过：

**核心链路（10 项）** — 注册返回 token 且不回传密码、重复用户名被拒、弱密码被拒、未登录 401、错误密码 401、正确凭证登录、普通用户访问 Admin 403、管理员可访问、API 404 返回 JSON。

**领域测试（22 项）**：

- 数据库包含 11 张业务表
- 种子数据满足厚度要求（≥3 账号 / ≥6 岗位 / ≥12 分类 / ≥40 题 / ≥8 会话）
- 种子数据跨 ≥7 个日期、四种会话状态都有样本
- 状态机定义与接口：**非法流转返回 400**（created → completed、终态后再流转、不存在的状态值）
- 练习计划状态机：跳级被拒，`progress` 100 推导为 `done`
- **越权**：他人会话详情 / 状态流转 / 生成计划 / 答案分析均 403；自建题仅本人可改删；内置题不可改
- **技能雷达计算**：评分写入后按维度聚合，返回最弱 / 最强维度；无报告时写入返回 400
- **答案分析落库**：写入 `answer_analyses` 与 `interview_rounds`，首次分析推进会话状态，同轮号更新而非新增
- **练习计划生成**：未评估时拒绝、生成后落库、含推荐题目与建议时长
- **分页**：题库分页不重复、越界页返回空列表、难度筛选与关键词搜索生效
- **AI 降级**：未配置 Key 时 `source = local` 且响应结构完整

完整验证（后端测试 + 前端构建 + 接口冒烟）：

```bash
bash verify.sh
```

## AI 配置

AI 能力统一由 `backend/src/ai.js` 提供入口，走 OpenAI 兼容的 `chat/completions` 接口。

| 环境变量 | 说明 | 默认值 |
| --- | --- | --- |
| `LLM_API_KEY` | 大模型 API Key，**留空即降级** | 空 |
| `LLM_BASE_URL` | 接口地址 | `https://api.openai.com/v1` |
| `LLM_MODEL` | 模型名 | `gpt-4o-mini` |
| `LLM_TIMEOUT` | 请求超时（毫秒） | `20000` |

行为说明：

- **已配置** `LLM_API_KEY`：出题、评估、答案分析、练习计划均调用真实大模型，响应 `source` 为 `llm`。
- **未配置或调用失败**：自动降级为本地规则引擎，`source` 为 `local`。出题从题库按岗位抽题；答案分析用 `domain/scoring.js` 按关键要点命中率计算；练习计划按低分维度生成。降级保证离线环境下功能完整可演示。
- 四个 AI 接口的返回体都带 `source` 字段，前端据此在气泡上标注"本地规则引擎"。

## 配置项

复制 `.env.example` 为 `.env` 后按需修改：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `SECRET_KEY` | 通用密钥 | `change-me-to-a-random-string` |
| `JWT_SECRET` | JWT 签名密钥 | `change-me-too` |
| `PORT` | 后端监听端口 | `4203` |
| `DB_PATH` | SQLite 数据库文件路径 | `backend/data/interviewgo.db` |
| `LLM_API_KEY` | 大模型 API Key | 空（降级本地规则） |
| `LLM_BASE_URL` | 大模型接口地址 | `https://api.openai.com/v1` |
| `LLM_MODEL` | 模型名 | `gpt-4o-mini` |

> 未配置 `JWT_SECRET` 时进程会生成随机密钥，重启后登录态失效。生产环境请显式配置。

## 主要接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` · `/register` | 登录 / 注册 |
| GET/POST/PUT/DELETE | `/api/entities/{positions,categories,sessions,rounds,messages,reports,skills,plans,analyses}` | 通用 CRUD（分页 + 搜索 + 筛选 + 归属校验） |
| GET | `/api/bank` | 题库列表（公共 + 自建，带岗位/分类名） |
| POST/PUT/DELETE | `/api/bank[/:id]` | 自建题增删改（内置题受保护） |
| POST | `/api/sessions/:id/transition` | **会话状态机流转**（非法 400） |
| GET | `/api/sessions/:id/detail` | 面试详情（轮次 + 答案分析 + 报告 + 技能 + 计划） |
| POST | `/api/reports/:sessionId/skills` | 报告 → **技能评分落库** |
| GET | `/api/skill-radar` | **技能雷达聚合**（可按会话过滤） |
| PUT | `/api/plans/:id/progress` | 练习计划进度回写（状态机校验） |
| POST | `/api/ai/ask` · `/evaluate` · `/analyze-answer` · `/practice-plan` | 四个 AI 接口（后两个结果落库） |
| GET | `/api/admin/overview` · `/api/admin/domain-stats` | 管理端统计 |

响应结构统一为 `{ code, data, message }`，成功 `code = 0`；鉴权用 `Authorization: Bearer <token>`。

## 设计文档

前端形态、Apple 基底落地细节与关键功能实现见 [DESIGN.md](./DESIGN.md)，其中包含：

- 对话流布局范式与差异化维度说明
- Apple 令牌层与 MUI 主题适配对照表
- 深色模式无闪烁的实现方式
- 流式打字机、答案分析、技能雷达、练习计划闭环的实现说明
- 五态齐全、分页与响应式的处理

## 截图

> 以下为占位，运行项目后可自行补充。

| 界面 | 截图 |
| --- | --- |
| 登录 / 注册 | ![登录页](./docs/screenshots/login.png) |
| 对话主界面 | ![对话主界面](./docs/screenshots/chat.png) |
| 岗位库 | ![岗位库](./docs/screenshots/positions.png) |
| 题库 | ![题库](./docs/screenshots/questions.png) |
| 技能雷达 | ![技能雷达](./docs/screenshots/radar.png) |
| 练习计划 | ![练习计划](./docs/screenshots/plans.png) |
| 面试详情 | ![面试详情](./docs/screenshots/detail.png) |
| Admin 概览 | ![Admin](./docs/screenshots/admin.png) |
