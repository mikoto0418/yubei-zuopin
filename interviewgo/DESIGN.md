# InterviewGo 前端设计文档

> 形态：**chat（对话流）** ｜ 组件库：**MUI v7** ｜ 框架：**React 18 + Vite 5**
> 设计基底：**Apple 设计语言**（`apple-tokens.css` 共享令牌层）｜ 主题色 `--purple` `#AF52DE`
> 端口：前端 5203 → 代理 `/api` → 后端 4203 ｜ localStorage 前缀：`ig_`

---

## 一、形态说明：对话即产品

InterviewGo 的前端不是"后台管理系统 + 聊天插件"，而是**核心体验就是一个对话界面**。这是与其它系统并排时能被一眼认出的关键。

### 布局范式

```
┌──────────────┬────────────────────────────────────────────┐
│ 导航（6 项）  │  顶栏（毛玻璃）：标题 + 状态/岗位/轮次 + 操作  │
│ · 面试对话    │────────────────────────────────────────────│
│ · 岗位库      │                                            │
│ · 题库        │        消息流（可滚动，自动滚到底）           │
│ · 练习计划    │   AI 左（填充色气泡） ←→ 用户右（主题色气泡） │
│ · 技能雷达    │        报告以气泡形式内嵌                     │
│ · 会话历史    │                                            │
│              │────────────────────────────────────────────│
│              │  底部输入框：Enter 发送 / Shift+Enter / 🎤    │
└──────────────┴────────────────────────────────────────────┘
```

对话页保留**左右两栏 + 气泡节奏**：左侧是可收起的会话列表（新建 / 搜索 / 状态筛选 / 加载更多），右侧是全屏对话区。其余页面复用同一套 `AppShell`（侧栏导航 + 毛玻璃顶栏 + 内容区）。

### 差异化维度：对话流 + 气泡节奏

Apple 基底之上，InterviewGo **只在"气泡节奏"这一个维度做区别**：

| 维度 | InterviewGo | 其它系统 |
| --- | --- | --- |
| 结果呈现 | **只有气泡，没有卡片** —— AI 气泡用 `--fill-secondary` 底，用户气泡用主题色实底白字；报告也以气泡内嵌进对话流 | 卡片网格 / 表格 / 抽屉 |
| 主交互 | **流式打字机**逐字输出 + 气泡逐条进入 | 拖拽 / 地图点选 / 时间轴 |
| 导航方式 | 会话列表 + 侧栏，无顶部标签栏 | 顶栏切换器 / 地图标记 |

**禁止的差异化手段**（Apple 规范 §3）：改字体族、改圆角基准、改间距基准、加发光/阴影特效。全站已去掉霓虹与发光。

### 页面清单

| 路由 | 页面 | 说明 |
| --- | --- | --- |
| `/login` | 登录页 | 登录 + 注册双 Tab，左侧品牌区，演示账号一键填充 |
| `/` | **对话主界面** | 会话列表 + 对话流（核心页面） |
| `/positions` | **岗位库** | 岗位卡片 + 技能标签 + 考察维度，支持自建岗位 |
| `/questions` | **题库** | 按岗位 / 分类 / 难度筛选 + 自建题（增删改） |
| `/plans` | **练习计划** | 弱项维度自动生成的计划列表 + 执行与进度回写 |
| `/radar` | **技能雷达** | SVG 雷达图展示 `skill_assessments` 多维度评分 |
| `/sessions/:id` | **面试详情** | 多轮次展示 + 每轮答案分析 + 报告 + 雷达 + 计划 |
| `/history` | 会话历史 | 卡片列表回看历次面试，总分与状态筛选 |
| `/admin` | Admin 概览 | 10 张统计卡 + 会话状态分布 + 用户表格 |
| `/403` `/404` | 无权限 / 未找到 | 兜底页 |

路由守卫 `RequireAuth` / `RequireAdmin` 拦截未登录与非管理员；`api.js` 收到 **401** 清登录态，**403** 抛出 `ApiError(403)` 并由页面渲染无权限态，不静默失败。

---

## 二、Apple 设计基底的落地

### 1. 令牌层

`src/apple-tokens.css` 是全站唯一的设计变量来源，`src/main.jsx` 中最先引入（早于 `index.css`），保证 `:root` 变量与基础重置在任何组件样式之前生效。

- **字体**：`--font-sans` 为 Apple 系统字体栈（`-apple-system` → `PingFang SC` → `HarmonyOS Sans SC` → 系统回退），中文不额外加字距
- **字号阶梯**：严格按 HIG，`Large Title 34/700`、`Title2 22/600`、`Headline 17/600`、`Body 17/400`、`Subhead 15/400`、`Footnote 13/400`、`Caption 12/400`，**无自创字号**
- **主题色**：只用一个系统色 `--purple #AF52DE`，其余颜色仅用于语义（成功 `--green`、警告 `--orange`、错误 `--red`、信息 `--blue`）
- **圆角**：只用 `8 / 12 / 16 / 22 / 999` 五档
- **阴影**：只有两档且极克制（`--shadow-card`、`--shadow-float`）
- **毛玻璃**：`--glass-bg` + `--glass-blur`，**仅用于悬浮层**（顶栏）

### 2. MUI 主题压到基底之下

`src/theme.js` 导出 `buildTheme(dark)`，在 `createTheme` 中完成组件库适配：

| 配置项 | 值 | 作用 |
| --- | --- | --- |
| `palette.primary.main` | `#AF52DE` | `--purple`，全站唯一主题色 |
| `shape.borderRadius` | `12` | 按钮、输入框统一 `--radius-md` |
| `typography.fontFamily` | Apple 字体栈 | 与令牌层同源 |
| `typography.h4…caption` | 34 / 22 / 17 / 17 / 15 / 12 | 逐档对齐 HIG 阶梯 |
| `shadows` | 25 档数组只填 2 种值 | 阴影只有"极浅"和"浮层"两档 |
| `MuiAppBar` | 毛玻璃 + 发丝线底边 | 唯一允许的悬浮层材质 |
| `MuiCard` / `MuiPaper` | 无边框 + 极浅阴影 | 卡片不再用描边 |
| `MuiButton` | `minHeight 36`、按下 `scale(0.97)` | Apple 控件手感 |
| `MuiFilledInput` | 填充式、无下划线、聚焦外发光 `0 0 0 4px rgba(175,82,222,0.12)` | Apple 输入框 |
| `MuiChip` | 圆角 8 + `--fill-secondary` 底，不用高饱和填充 | Apple 标签 |
| `MuiDialog` | `--radius-xl` + 遮罩 `rgba(0,0,0,0.32)` + `blur(2px)` | Apple 弹窗 |

### 3. 深色模式（无闪烁）

`App.jsx` 用 `prefersDark()`（`matchMedia('(prefers-color-scheme: dark)')`）初始化 `dark` 状态，**首帧就按系统偏好生成主题**，不存在浅色闪一下再变深的过程；并监听 `change` 事件实时切换。深色下背景 `#000` / 卡片 `#1C1C1E` / 分组底 `#0D0D0F`，与 Apple 规范 §2.2 一致。

### 4. 动效与降级

- 页面进入：`@keyframes ig-page-in`（`opacity 0→1` + `translateY(8px→0)`，`--dur-base`）
- 气泡进入：`@keyframes ig-bubble-in`（同上，用于消息节奏）
- 打字光标与骨架微光是为数不多的循环动画，且都有语义（流式输出中 / 加载中）
- **全部动效在 `prefers-reduced-motion: reduce` 下降级为 0.01ms**（`index.css` 与 `apple-tokens.css` 双重保障）

---

## 三、流式打字机输出

chat 形态最核心的交互，实现集中在 `src/context/ChatContext.jsx` 的 `streamOut`。

1. **逐字追加**：`setInterval` 每 16ms（约一帧）推进游标，`setStream` 只更新"已显示的前缀"，React 增量渲染已存在的文本，不闪烁。
2. **自适应步长**：`chunk = 文本长度 / 240`，短问题逐字蹦，长报告按块推进——既保留打字感，又把整体节奏压在 1~3 秒内。
3. **返回 Promise**：`await streamOut(text)` 之后才把完整内容落库，保证"打完字"与"存下来"顺序一致。
4. **跳过动画**：`skipTyping()` 立即补全全文并 resolve，界面提供"跳过打字动画"按钮。
5. **思考指示器**：请求发出但未拿到文本时显示 `TypingIndicator`，并按阶段区分文案——"面试官正在思考下一个问题" / "正在分析本轮回答的要点命中情况" / "面试官正在生成评估报告"。

---

## 四、关键功能的实现说明

### 1. 面试流程闭环（状态机驱动）

会话状态机在后端 `db.js` 中定义为唯一权威，所有流转经 `POST /sessions/:id/transition` 校验，非法流转返回 **400**：

```
created ──▶ in_progress ──▶ completed ──▶ evaluated
```

前端流程：

```
新建会话（从岗位库选岗位，自动带出级别与标题）
  → POST /entities/sessions            （status: created）
  → POST /sessions/:id/transition      （created → in_progress）
  → POST /ai/ask {position_id, round:1}  ← 从题库抽第一题
  → 打字机输出 → 落库 ai 消息 → round_count = 1

用户回答
  → POST /entities/messages (role:user)
  → POST /ai/analyze-answer            ← 要点命中/遗漏 → answer_analyses + interview_rounds
  → POST /ai/ask {round+1}             ← 下一题
  → 打字机输出 → 落库 → round_count += 1

结束面试
  → POST /ai/evaluate {messages, session_id}（轮次评分参与计算）
  → POST /entities/reports             （写报告，带 source）
  → 报告卡片进对话流（card_type = 'report'）
  → transition completed → evaluated
  → POST /reports/:id/skills           ← 评分写入 skill_assessments
  → POST /ai/practice-plan             ← 低分维度 → practice_plans
```

**关键闭环**：`skill_assessments`（评分落库）→ 驱动 `practice_plans`（自动生成）→ 用户在 `/plans` 执行并回写进度（`progress` 驱动 `status`，同样受状态机约束）。

### 2. 答案要点分析

每轮回答后调用 `POST /ai/analyze-answer`，后端用 `domain/scoring.js` 的规则（或 LLM）计算命中/遗漏要点，写入 `answer_analyses`，同时把该轮的技术准确度 / 表达清晰度 / 深度评分写入 `interview_rounds`。首次分析会把会话从 `created` 推进到 `in_progress`；同一轮号重复分析执行更新而非新增。详情页按轮次展示命中（绿）与遗漏（橙）标签。

### 3. 技能雷达（纯 SVG，零图表库）

`src/components/SkillRadar.jsx` 用 SVG 手绘：4 圈网格多边形 + 轴线 + 数据面（主题色 18% 填充）+ 数据点 + 维度标签。数据来自 `GET /api/skill-radar`，后端按 `dimension_key` 聚合 `AVG(score)`，并返回 `average` / `level` / `weakest` / `strongest`。维度少于 3 个时给出明确说明而非空白图。

### 4. 消息操作

- **复制**：`navigator.clipboard.writeText`，成功后图标变对勾并弹 Snackbar。
- **重新生成**：仅 AI 文本消息可点（报告与用户消息不可）。按"该消息是第几题"重新调 `/ai/ask`，先移除旧消息，打字完成后原位插回。生成中禁用，防止并发。

### 5. Markdown 渲染（自研轻量）

`src/components/Markdown.jsx` 零依赖，**先 `escapeHtml` 再解析**，从根本上避免 XSS。支持标题、粗体/斜体、行内代码、代码块（带语言标记）、有序/无序列表、引用、分割线、链接。样式走 Apple 令牌（行内代码 `--font-mono` + `action.hover` 底，代码块圆角 12）。

### 6. 语音输入

`Composer.jsx` 使用浏览器原生 `SpeechRecognition`（含 `webkit` 前缀探测），`lang='zh-CN'`、`continuous=true`、`interimResults=true`，实时把临时结果拼进输入框。不支持时按钮显示 `MicOff` 并给出换用 Chrome/Edge 的提示；权限被拒时明确告知；组件卸载自动 `stop()` 释放麦克风。

### 7. 五态齐全

每个页面都覆盖 **加载 / 空 / 错误 / 无权限 / 404** 五态，统一由 `src/components/States.jsx` 提供：

| 状态 | 实现 |
| --- | --- |
| **加载** | `LoadingBlock` 骨架屏（不用转圈）；`FullScreenLoading` 用于路由守卫；AI 思考用 `TypingIndicator` |
| **空** | `EmptyState`：图标 + 一句说明 + 一个行动按钮（如"还没有练习计划" → "生成练习计划"） |
| **无结果** | `NoResults`：与"暂无数据"区分，给"清空筛选"而非引导创建，避免误导 |
| **错误** | `ErrorState`：说明 + 重试按钮 |
| **无权限** | `ForbiddenState`：403 时由页面按 `error.status === 403` 渲染，不给重试按钮（重试也不会成功） |

`PageState` 组件把四个分支收敛到一个入口，页面只需给出 `loading` / `error` / `empty` 三个值。

### 8. 分页与响应式

- 会话列表、题库、岗位库、练习计划、历史页均为"加载更多（已加载/总数）"追加式分页；越界页返回空列表而非报错。
- 断点 `md`：以上为"固定侧栏 + 内容区"，以下侧栏转 `Drawer` 抽屉、气泡宽度放宽、顶栏按钮自适应。

### 9. 表单校验

登录/注册、新建会话、自建岗位、自建题均做**前端校验 + 后端 message 回显**双层。前端失败即时在 `helperText` 展示；后端失败（用户名已存在、内置题不可改）在表单顶部或以 Snackbar 显示后端返回的中文 message。

---

## 五、目录结构

```
frontend/
├── index.html
├── package.json                 # React 18 / Vite 5 / MUI 7 / react-router-dom 6
├── vite.config.js               # port 5203，/api → localhost:4203
├── src/
│   ├── main.jsx                 # 入口：apple-tokens.css → index.css → BrowserRouter
│   ├── App.jsx                  # 深色模式监听 + 主题/上下文/路由装配
│   ├── api.js                   # 请求封装 + 全部领域接口
│   ├── theme.js                 # Apple 基底 MUI 主题（buildTheme / prefersDark）
│   ├── apple-tokens.css         # Apple 设计令牌层（唯一变量来源）
│   ├── index.css                # 基础样式 + 动效关键帧 + reduced-motion 降级
│   ├── context/
│   │   ├── AuthContext.jsx      # 登录态（ig_token/ig_user）
│   │   ├── ChatContext.jsx      # 核心：会话/消息/流式输出/答案分析/闭环
│   │   └── SnackbarContext.jsx  # 全局通知
│   ├── components/
│   │   ├── AppShell.jsx         # 侧栏导航 + 毛玻璃顶栏（各页复用）
│   │   ├── MessageBubble.jsx    # 消息气泡（差异化核心）
│   │   ├── ReportCard.jsx       # 报告（环形总分 + 三维度 + 写评分/生成计划入口）
│   │   ├── SkillRadar.jsx       # SVG 雷达图
│   │   ├── Markdown.jsx         # 轻量 Markdown
│   │   ├── Composer.jsx         # 输入框（Enter/Shift+Enter/语音）
│   │   ├── SessionList.jsx      # 会话列表（搜索/筛选/分页/操作）
│   │   ├── SessionDialog.jsx    # 新建/编辑会话（从岗位库带出）
│   │   ├── RouteGuards.jsx      # RequireAuth / RequireAdmin
│   │   └── States.jsx           # 五态 + TypingIndicator + PageState
│   └── pages/
│       ├── Chat.jsx             # 对话主界面
│       ├── Positions.jsx        # 岗位库
│       ├── Questions.jsx        # 题库
│       ├── Plans.jsx            # 练习计划
│       ├── Radar.jsx            # 技能雷达
│       ├── SessionDetail.jsx    # 面试详情（多轮次 + 答案分析）
│       ├── Login.jsx / History.jsx / Admin.jsx
│       └── Forbidden.jsx / NotFound.jsx
```

---

## 六、自查结论（对照 Apple 规范 §5）

- [x] 字体族与字号阶梯完全按 §2.1，没有自创字号
- [x] 主题色只有一个（`--purple`），取自 §2.2 系统色
- [x] 卡片无边框、阴影极浅；毛玻璃只用在顶栏等悬浮层
- [x] 分隔线是 1px 发丝线，没有粗边框
- [x] 深色模式可用，首帧即按系统偏好生成主题，切换无闪烁
- [x] 圆角只用 §2.3 定义的档位
- [x] 动效有 `prefers-reduced-motion` 降级
- [x] 每页有加载 / 空 / 错误 / 无权限 / 404 五态
- [x] 没有霓虹、扫描线、终端绿、硬投影、粗黑边
- [x] 保留"对话流 + 气泡节奏"差异化：只有气泡，没有卡片
- [x] 与其它系统并排看：基底一致，但一眼能认出是哪个
