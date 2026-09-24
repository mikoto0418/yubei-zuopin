# ExamPrep — AI 备考规划助手

面向 **考研 / 四六级 / 考公** 通用的备考规划 AI 助手（学生作品 · 功能完整 · 可部署 · 可测试）。
前端为**原生 HTML/CSS/JS 单页应用（无构建步骤）**，采用 **Apple 设计语言基底 + 命令行 + 时间块日历**；
后端为轻量 REST API，前后端同端口部署（**4105**）。

> 差异化维度：**时间块日历（30 分钟粒度 · 可拖拽） + 命令行驱动**。
> 视觉基线统一到 Apple 设计系统（浅色分组底 + 白卡片 + 无衬线 + 发丝线分隔），深色模式随系统切换。

---

## 功能总览

### 核心业务（时间块驱动的备考闭环）

| 模块 | 说明 |
| --- | --- |
| **时间块日历** | 计划按 **30 分钟粒度**排到日历上，支持**拖拽改时段 / 跨天移动**；网格自动按数据范围（默认 06:00–23:00）伸缩；状态机 `planned → in_progress → done / skipped`（跳过必填原因，非法流转返回 400）；完成时间块自动累加当日学习时长 |
| **模考记录** | 录入模考总分 + 各科得分（结构化 JSON）+ 排名；生成**总分趋势折线**与**各科平均得分率柱状图**，自动计算提分幅度与最好成绩 |
| **错题本** | 错题 + 知识点 + 错因；状态机 `new → reviewing → mastered`；支持「重做」累计复做次数与「标记/取消掌握」；按科目统计掌握率 |
| **学习资料库** | 书籍 / 链接 / 笔记 / 视频四类，按科目分类；记录 `已读页数 / 总页数`，读满自动置为「已完成」；整体进度条 |
| **提醒中心** | 时间块创建时自动生成「即将开始」提醒；**「扫描未完成计划」**自动为过期未完成的时间块生成补做提醒（幂等，不重复生成）；状态机 `pending → sent → done / dismissed` |

### 支撑模块

| 模块 | 说明 |
| --- | --- |
| 账号系统 | 注册 / 登录 / 退出，JWT 认证；**三角色** `admin` / `mentor` / `student`，越权返回 403 |
| 科目与知识点 | 6 科目 → 30 知识点两层体系，带难度与掌握度；知识点可挂到时间块与错题 |
| 目标管理 | 各科目目标分 + 权重 + 当前进度，加权完成度实时显示；新增 / 编辑 / 删除 / +3 / 搜索 |
| 备考计划 | 每日计划的文字版记录，与时间块互补；搜索 / 按范围筛选 |
| 做题追踪 | 按科目 + 知识点录入做题数 / 做对数，统计各科与知识点正确率 |
| 学习统计 | 录入 / 累计当日时长，近 14 天趋势折线与明细 |
| 语音能力 | `speechSynthesis` 朗读当日时间块；`SpeechRecognition` 语音「学习某科 X 小时」自动录入 |
| AI 计划 | 按目标考试 / 薄弱知识点 / 待攻克错题生成计划，**拆解为 `plan_blocks` 写入日历**（LLM / 本地规则保底）|
| AI 提分建议 | 对薄弱科目生成建议，可**一键落库为待办提醒** |
| AI 单题讲解 | 生成含「解题思路 / 易错点 / 口诀」的中文解析 |
| 管理后台 | 全站看板：科目正确率雷达、时长趋势、**时间块状态分布**、目标达成、用户注册分布、**账号角色分布**；用户列表 |

### 命令行（记忆点）

底部是**真实的命令行输入框**，不是装饰。19 条命令，支持前缀自动补全（Tab）、候选上下选择（↑↓）、会话历史、逐行打字机输出。

| 命令 | 作用 |
| --- | --- |
| `calendar` / `plan` / `exam` / `wrong` / `material` / `reminder` / `quiz` / `stats` / `goal` / `ai` / `me` / `admin` | 切换视图 |
| `block add <科目> <标题> <HH:MM> <HH:MM>` | 快捷新增时间块（默认当天） |
| `done <块ID>` | 把时间块标记为已完成 |
| `skip <块ID> <原因>` | 跳过时间块（**必须写原因**，与后端状态机一致） |
| `aiplan` | 生成 AI 计划并排入日历（结果逐行打印） |
| `help` / `history` / `clear` | 列出命令 / 历史 / 清屏 |

---

## 技术栈

- **后端**：Node.js + Express + better-sqlite3（SQLite，WAL）；jsonwebtoken + bcryptjs；Node 原生 `fetch`
- **前端**：原生 HTML / CSS / JS（**无框架、无构建工具**）；Shoelace 2（Web Components，本地 vendor + autoloader）；Open Props（重置）；Chart.js（本地 vendor）
- **设计系统**：Apple 设计语言基底（共享令牌层 `css/apple-tokens.css`），主题色 `--yellow`；深色模式用 `prefers-color-scheme` 自动切换
- **差异化**：时间块日历（30 分钟粒度网格 + 拖拽）+ Apple 风格命令面板

---

## 数据模型（12 张表）

| 表 | 说明 |
| --- | --- |
| `users` | 账号与角色（admin / mentor / student）、目标考试、考试日期 |
| `subjects` | 科目（名称 / 颜色 / 排序） |
| `knowledge_points` | 知识点（归属科目 / 章节 / 难度 / 掌握度） |
| `goals` | 目标（科目 / 目标分 / 权重 / 进度 / 状态） |
| `plans` | 每日计划文字记录 |
| **`plan_blocks`** | **时间块**（日期 / 起止时间 / 状态 / 跳过原因 / 来源 manual\|ai / 关联知识点） |
| `tasks` | 做题记录（做题数 / 做对数 / 知识点标签） |
| `mock_exams` | 模考（总分 / 满分 / 各科得分 JSON / 排名） |
| `wrong_questions` | 错题（题目 / 我的答案 / 正确答案 / 错因 / 状态 / 复做次数） |
| `study_materials` | 资料（类型 / 链接 / 总页数 / 已读页数 / 状态） |
| `reminders` | 提醒（时间 / 关联对象 / 状态 / 渠道） |
| `stats` | 每日学习时长 |

**状态机一览**

| 实体 | 流转 | 约束 |
| --- | --- | --- |
| `plan_blocks` | `planned → in_progress → done` / `→ skipped` | 跳过必填 `skip_reason`；`done` / `skipped` 为终态；非法流转返回 **400** |
| `wrong_questions` | `new → reviewing → mastered`（可回退） | 已掌握再标掌握返回 400 |
| `reminders` | `pending → sent → done` / `→ dismissed` | `done` / `dismissed` 为终态 |

**AI 落库闭环**：`/api/ai/plan` 的结果**拆解为 `plan_blocks` 写入日历**（30 分钟对齐、自动避让已有时间块、同时生成开始提醒），当天视图直接读取并渲染 —— 形成「数据 → AI → 落库 → 驱动后续流程」的完整闭环。

---

## 目录结构

```
examprep/
├─ README.md
├─ DESIGN.md                          # 前端设计文档（Apple 基底 + 差异化维度）
├─ .gitignore
├─ start.bat / start.ps1 / start.sh   # 一键启动
├─ verify.sh                          # 一键验证（测试 + 资源 + 接口冒烟）
├─ backend/                           # 后端（Express + SQLite）
│  ├─ server.js                       # 入口：路由挂载 + 静态托管 + 统一异常
│  ├─ db.js                           # 12 张表建表 / 状态机定义 / 幂等种子
│  ├─ seed.js                         # 手动重置种子（node seed.js）
│  ├─ middleware/auth.js              # JWT 认证 / requireAdmin / requireMentor
│  ├─ routes/
│  │  ├─ auth.js                      # 注册 / 登录 / 个人概览（含新模块指标）
│  │  ├─ subjects.js                  # 科目 + 知识点
│  │  ├─ goals.js                     # 目标管理
│  │  ├─ plans.js                     # 每日计划
│  │  ├─ blocks.js                    # 时间块日历（状态机 / 拖拽 / 冲突校验）
│  │  ├─ tasks.js                     # 做题记录 + 正确率
│  │  ├─ exams.js                     # 模考记录 + 趋势
│  │  ├─ wrong.js                     # 错题本（状态机）
│  │  ├─ materials.js                 # 学习资料库 + 阅读进度
│  │  ├─ reminders.js                 # 提醒中心 + 未完成计划扫描
│  │  ├─ stats.js                     # 学习时长
│  │  ├─ ai.js                        # AI 计划（落库为时间块）+ 建议 + 讲解
│  │  ├─ admin.js                     # 管理看板（admin / mentor）
│  │  └─ util.js                      # 响应 / 校验 / 分页工具
│  ├─ test/api.test.js                # 接口测试（node:test，50 个用例）
│  ├─ package.json
│  └─ .env.example
└─ frontend/                          # 前端静态文件（由后端托管，无构建）
   ├─ index.html                      # 12 个视图 + 命令行 + 弹窗
   ├─ css/
   │  ├─ apple-tokens.css             # Apple 共享令牌层（十套系统统一引用）
   │  └─ style.css                    # 本项目皮肤：--yellow + 日历 + 命令行
   ├─ js/app.js                       # 全部逻辑（视图 / 命令行 / 拖拽 / 图表）
   └─ vendor/                         # 本地依赖（shoelace / open-props / chartjs）
```

---

## 安装与启动

前置：**Node.js ≥ 18**（推荐 20+，需内置原生 `fetch`）。

### 方式一：一键启动（推荐）

- Windows：双击 `start.bat`，或在 PowerShell 运行 `./start.ps1`
- Linux / Mac：`bash start.sh`

脚本会自动安装依赖（首次）并启动服务。

### 方式二：手动

```bash
cd backend
npm install
npm start          # 默认端口 4105
```

可选：复制 `.env.example` 为 `.env` 以修改端口 / 密钥 / AI 配置。

前端由后端通过 `express.static` 直接托管，**无需单独启动前端服务，也没有构建步骤**（改完源码刷新即可）。
启动后访问：**http://localhost:4105/**

---

## 测试

```bash
cd backend
npm test          # node:test 接口测试，50 个用例
```

覆盖范围（14 个套件 / **50 个用例，全部通过**）：

- 账号与权限：注册校验 / 重复 409 / 登录 401 / **学员访问 admin 403** / **助教(mentor) 可访问 admin 200** / 未登录 401 / 未知路由 404
- 目标、计划的 CRUD 与分页边界
- **时间块状态机**：`planned → in_progress → done` 合法链路、终态再流转 400、跳过未填原因 400、30 分钟粒度校验、重叠冲突 400、拖拽改时段、完成自动累加时长、分页与状态筛选
- 科目与知识点：数量校验、按科目筛选、分页、科目不存在 404
- 模考：趋势曲线、提分幅度、总分超满分 400、录入 / 编辑 / 删除
- 错题本：掌握率概览、`new → reviewing → mastered` 与回退、重复流转 400、分页与筛选
- 资料库：概览进度、超总页数 400、读满自动完成、非法链接 400
- 提醒中心：概览、`pending → done` 与终态校验、时间格式 400、**扫描补做提醒幂等**
- 做题正确率计算、学习时长录入
- **AI 降级**：未配置 key 时 `source=内置规则引擎`；AI 计划**落库为 30 分钟对齐且互不重叠的 plan_blocks**；`save=true` 时建议落库为提醒
- Admin 仪表盘：新模块统计字段与用户列表分页

测试使用**独立临时数据库**，不会污染真实数据。

### 一键验证

```bash
bash verify.sh    # 后端测试 → 前端静态资源完整性 → 接口冒烟
```

---

## 默认账号（种子数据）

| 账号 | 密码 | 角色 | 备注 |
| --- | --- | --- | --- |
| `admin` | `admin123` | `admin` | 可进入管理后台（含用户列表） |
| `demo` | `demo123` | `student` | **主演示账号**：6 科目 / 30 知识点 / 20 目标 / 50 时间块（跨 14 天）/ 40 做题 / 12 次模考 / 25 道错题 / 20 份资料 / 15 条提醒 |
| `student1` | `student123` | `mentor` | 助教视角，同样可看管理后台 |

重置演示数据：删除 `backend/examprep.db` 后重启服务，或运行 `node seed.js`（清空并重建种子，幂等可重复执行）。

---

## AI 能力配置（可选）

默认**不配置 key 也能运行**：AI 接口未配置 `LLM_API_KEY` 时自动退回「内置规则引擎」，
按目标考试 / 剩余天数 / 薄弱知识点生成合理计划与建议，响应带 `source` 来源标注。
测试环境会把 key 置空以强制走降级分支，保证测试不依赖外部网络。

接入真实大模型（兼容 OpenAI Chat Completions），在 `backend/.env` 配置：

```env
LLM_API_KEY=你的密钥
LLM_BASE_URL=https://api.openai.com/v1   # 或其他兼容服务地址
LLM_MODEL=gpt-4o-mini
```

配置后优先调用大模型，失败时自动回退内置规则，保证离线可演示。

## 环境变量一览

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `4105` | 服务端口 |
| `SECRET_KEY` | dev 默认 | JWT 签名密钥（兼容旧名 `JWT_SECRET`），生产务必改为随机长串 |
| `LLM_API_KEY` | 空 | 不配置则使用内置规则 |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | 兼容 OpenAI 的接口地址 |
| `LLM_MODEL` | `gpt-4o-mini` | 模型名 |
| `EXAMPREP_DB` | `backend/examprep.db` | 数据库文件路径（测试用临时库） |

---

## 主要接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/blocks/calendar?date=&days=` | 日历视图（日 / 周），含每日分钟数与知识点名 |
| POST | `/api/blocks` | 新建时间块（30 分钟粒度 + 重叠校验 + 自动生成提醒） |
| PUT | `/api/blocks/:id/status` | **状态流转**（非法流转 400，跳过必填原因） |
| PUT | `/api/blocks/:id/schedule` | **拖拽改时段 / 跨天移动**（终态不可改） |
| GET | `/api/exams/trend` | 模考趋势（分数曲线 / 提分幅度 / 各科得分率） |
| PUT | `/api/wrong/:id/review` · `/master` | 错题重做 / 标记掌握（状态机） |
| PUT | `/api/materials/:id/progress` | 更新阅读进度（读满自动完成） |
| POST | `/api/reminders/scan` | **扫描未完成计划生成补做提醒（幂等）** |
| POST | `/api/ai/plan` | 生成 AI 计划并**落库为 `plan_blocks`** |
| POST | `/api/ai/analysis` | 提分建议（`save=true` 落库为待办提醒） |

响应结构统一为 `{ ok, ... }`，错误为 `{ ok: false, message }`；鉴权用 `Authorization: Bearer <token>`。

---

## 语音功能说明

- **语音朗读**：朗读当日**时间块**（含起止时间与科目）；需 `speechSynthesis`（Chrome / Edge 中文音色较佳），不支持时前端降级提示。
- **语音识别**：需 `SpeechRecognition`（Chrome 系 + 授权麦克风）；说「学习数学 2 小时」即自动录入当日时长。
- 语音均在**用户点击手势后**触发，避免浏览器自动播放限制。

---

## 常见问题

- **端口被占用（4105）**：改 `backend/.env` 中 `PORT`（如 4115）后重启，端口需全局唯一。
- **时间块拖不动**：`done` / `skipped` 为终态不可调整；`planned` / `in_progress` 才能拖动。改时段会自动校验 30 分钟对齐与冲突。
- **图表未渲染**：Chart.js 已本地 vendor 化（`frontend/vendor/chartjs/`），无需联网；若空白请确认资源未被拦截。
- **依赖安装失败**：确认 Node ≥ 18 且装有 VS Build Tools；或使用 Node 预编译二进制。

---

## 截图占位

> 待补充：时间块日历（浅色 / 深色） / 命令行 / 模考趋势 / 错题本 / 资料库 / 提醒中心 / 管理看板。

## LICENSE

仅用于学习交流（学生作品）。未经许可不得用于商业用途。
