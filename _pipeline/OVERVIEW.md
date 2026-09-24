# 十套系统总览

> 本文件是整个工作区（`F:\traecode`）的交付索引。十套系统全部为「功能完整 · 可部署 · 可测试」的作品级全栈项目。
> 统一设计基底：**Apple 设计语言**（规范见 `APPLE_DESIGN_SYSTEM.md`）。差异化靠**每套独有的交互范式 + 一个克制的主题色**。

---

## 一、十套一览

| # | 项目 | 形态 | 主题色 | 组件库 | 后端 | 端口 | 批次 |
|---|------|------|--------|--------|------|------|------|
| 1 | **MindCare** | 底部 Tab + 卡片流 | `--pink` | Mantine 8 | Flask | 4101 | 一 |
| 2 | **ScholarBoard** | ⌘K 命令面板 + 三栏 | `--orange` | Naive UI 2 | Express | 4102 | 一 |
| 3 | **EduPulse** | 可拖拽 Widget 驾驶舱 | `--teal` | Ant Design 6 | Flask | 4103 | 一 |
| 4 | **HiveMarket** | 瀑布流 + 抽屉 + 浮层聊天 | `--red` | PrimeVue 4 | Express | 4104 | 一 |
| 5 | **ExamPrep** | 时间块日历 + 命令行 | `--yellow` | Shoelace 2 | Express | 4105 | 一 |
| 6 | **KitchenFlow** | 后厨看板 + 倒计时进度环 | `--orange` | shadcn 设计语言 | Express | 4201 | 二 |
| 7 | **CityLens** | 全屏地图 + 毛玻璃浮层 | `--green` | Element Plus | Express | 4202 | 二 |
| 8 | **InterviewGo** | 对话流 + 气泡节奏 | `--purple` | MUI v7 | Express | 4203 | 二 |
| 9 | **ScriptForge** | 纸张质感 + 衬线正文 | `--indigo` | Arco Design | Express | 4204 | 二 |
| 10 | **LogiTrack** | 中轴时间轴 + 地图联动 | `--blue` | Chakra UI v3 | Express | 4205 | 二 |

**十套十个组件库，无一重复。**

---

## 二、差异化在哪

差异不靠配色，而靠**产品形态**（布局范式 / 导航模型 / 主交互），十套互不重复：

| 项目 | 布局 | 导航 | 主交互 |
|------|------|------|--------|
| MindCare | 760px 单列卡片流 | 底部悬浮胶囊 | 滚动视差 + 全屏沉浸冥想 |
| ScholarBoard | 三栏（树/编辑器/属性） | ⌘K 命令面板 | 所见即所得编辑 |
| EduPulse | 可拖拽 Widget 网格 | 网格即桌面 | 拖拽重排 |
| HiveMarket | 不等高瀑布流 | 顶部集市条 | 抽屉详情 + 浮层聊天 |
| ExamPrep | 时间块日历 | 命令行 | 30 分钟粒度排程 + 命令驱动 |
| KitchenFlow | 横向档口泳道 | 顶栏切换 | 订单卡倒计时 + 状态流转 |
| CityLens | 全屏地图 | 地图标记点 | 点选标记 → 侧滑详情 |
| InterviewGo | 会话列表 + 全屏对话 | 会话列表 | 流式对话 + 报告卡片内嵌 |
| ScriptForge | 三栏（结构/编辑/角色） | 作品结构树 | 衬线正文写作 + 对白编辑 |
| LogiTrack | 中轴时间轴 + 地图 | 运单号搜索 | 时间轴与地图双向联动 |

---

## 三、业务深度

每套 ≥11 张表、≥1 条真实状态机（非法流转返回 400）、≥3 个 AI 功能（其中至少一个把结果写回业务表并驱动后续流程）、≥3 种角色（越权 403）。

| 项目 | 表数 | 测试数 | 核心状态机 |
|------|:---:|:---:|------|
| MindCare | 14 | 42 | 预约 pending → confirmed → completed / cancelled |
| ScholarBoard | 11 | 28 | 简历 draft → polished → final |
| EduPulse | 12 | 32 | 目标 active → achieved / expired |
| HiveMarket | 13 | 26 | 订单 待确认 → 待发货 → 待收货 → 已完成（含退款分支） |
| ExamPrep | 12 | 50 | 计划块 planned → in_progress → done / skipped |
| KitchenFlow | 11 | 43 | 订单 pending → accepted → cooking → ready → served → paid |
| CityLens | 11 | 41 | 工单 created → assigned → in_progress → resolved → verified → closed |
| InterviewGo | 11 | 32 | 会话 created → in_progress → completed → evaluated |
| ScriptForge | 12 | 45 | 作品 draft → reviewing → revising → approved → archived |
| LogiTrack | 12 | 59 | 运单 8 状态（含 exception / returned 分支） |

---

## 四、复用流水线

`_pipeline/` 是产出这些系统的工具链，三层分离：

- **L1 内核**（`kernel/node/`）— 鉴权、DB、统一响应、CRUD 工厂、AI 降级、错误处理。第二批五套完全复用。
- **L2 形态**（`forms/README.md`）— 五种产品形态的交互规格。
- **L3 领域**（`projects/*.config.mjs`）— 每套的实体、AI 功能、演示数据。

新增一套系统只需写一份 config：
```bash
node _pipeline/scaffold.mjs _pipeline/projects/<name>.config.mjs
```

---

## 五、启动

每套都可一键启动（Windows 用 `start.bat`，Linux/macOS 用 `start.sh`）：

```bash
cd mindcare && bash start.sh
```

脚本流程：装后端依赖 → 装前端依赖 → 构建前端 → 初始化数据 → 启动服务（单端口托管前端）。

---

## 六、验证

三层验证，全部为真实构建与真实 HTTP 请求：

```bash
# 1) 十套统一验收：后端测试 → 前端构建 → 接口冒烟（401 拦截 + 管理员登录）
bash _pipeline/verify-all.sh

# 2) 十套前端页面托管冒烟：首页 HTML → 首页引用的本地资源可达 → SPA 深链回退
bash _pipeline/smoke-frontend.sh

# 3) 单套验收
cd kitchenflow && bash verify.sh
```

**最近一次全量结果**：`verify-all.sh` 通过 **40 / 失败 0**；`smoke-frontend.sh` 通过 **30 / 失败 0**。

---

## 七、演示账号

| 项目 | 管理员 | 业务角色 A | 业务角色 B |
|------|--------|-----------|-----------|
| MindCare | `admin / admin123` | `xiaolan / xiaolan123` | `counselor1 / counselor123` |
| ScholarBoard | `admin / admin123` | `alice / 123456` | `bob / 123456` |
| EduPulse | `admin / admin123` | `demo / demo123` | `student1 / student123` |
| HiveMarket | `admin / admin123` | `zhangsan / 123456` | `lisi / 123456` |
| ExamPrep | `admin / admin123` | `demo / demo123` | `student1 / student123` |
| KitchenFlow | `admin / admin123` | `waiter1 / waiter123`（服务员） | `chef1 / chef123`（厨师） |
| CityLens | `admin / admin123` | `inspector1 / inspector123` | `inspector2 / inspector123` |
| InterviewGo | `admin / admin123` | `candidate / candidate123` | `jobseeker / jobseeker123` |
| ScriptForge | `admin / admin123` | `writer1 / writer123`（编剧） | `editor1 / editor123`（责编） |
| LogiTrack | `admin / admin123` | `dispatcher1 / dispatcher123` | `courier1 / courier123` |

---

## 八、AI 配置

每套后端都支持 OpenAI 兼容接口，在 `backend/.env` 中配置：

```
LLM_API_KEY=sk-xxx
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

**未配置时自动降级为本地规则引擎**，所有 AI 功能离线也能演示，响应中 `source` 字段标注来源（`llm` / `local`）。

---

## 九、目录结构

```
F:\traecode\
├── mindcare/  scholarboard/  edupulse/  hivemarket/  examprep/     # 第一批（领域保留 + 深化 + Apple 化）
├── kitchenflow/ citylens/ interviewgo/ scriptforge/ logitrack/     # 第二批（重开 / 深化 + Apple 基底）
├── _pipeline/                    # 复用流水线
│   ├── README.md                 # 流水线说明
│   ├── OVERVIEW.md               # 本文件
│   ├── APPLE_DESIGN_SYSTEM.md    # Apple 设计语言规范（十套共用）
│   ├── FUNCTIONAL_SPEC.md        # 十套功能规格（深化版）
│   ├── apple-tokens.css          # 共享令牌层（分发到各项目 frontend/src）
│   ├── FRONTEND_SPEC.md          # API 契约与前端约定
│   ├── BATCH1_REWORK.md          # 第一批形态改造方案
│   ├── scaffold.mjs              # 生成器：config → 完整项目骨架
│   ├── verify-all.sh             # 十套统一验收
│   ├── smoke-frontend.sh         # 十套前端页面托管冒烟
│   ├── capture-screenshots.sh    # 截图采集辅助脚本
│   ├── SCREENSHOT_CHECKLIST.md   # 截图清单与视觉核对点
│   ├── kernel/node/              # L1 内核
│   ├── forms/                    # L2 五种产品形态规格
│   └── projects/                 # L3 五个 config
├── _screenshots/                 # 十套主界面截图
├── _backup_frontends_20260923_1846/   # 改造前备份
└── _DIFFERENTIATION_REPORT.md         # 第一批改造报告
```

每个项目内部：
```
<project>/
├── backend/          # API 服务 + 测试
├── frontend/         # 前端源码 + 构建产物（examprep 为静态直出，无构建步骤）
├── README.md         # 项目说明（功能 / 技术栈 / 启动 / 测试 / 账号 / AI 配置）
├── DESIGN.md         # 中文设计文档（形态说明 + 与其它九套的差异 + Apple 自检清单）
├── start.sh / start.bat
└── verify.sh
```
