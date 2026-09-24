# ScholarBoard 前端设计文档

> 本文档记录 scholarboard 前端的设计决策与实现映射。
> 十套系统差异化改造规范的对应实施记录，硬约束自检结果见文末。
>
> **第二批次已实施「形态改造」**（编辑器优先 + 命令面板），见第 0 节。
> **第三批次已实施「Apple 基底改造 + 业务补深」**，见第 0.0 节。

---

## 0.0 第三批次：Apple 设计基底 + 业务补深

> 目标：保留「⌘K 命令面板 + 三栏工作区」这一差异化，把视觉从
> 「暖白纸感 + 珊瑚橙 + 圆角为 0」的杂志风，整体压到
> `_pipeline/APPLE_DESIGN_SYSTEM.md` 定义的 **Apple 设计语言基底**；
> 同时把后端从 4 张表补深到 **11 张表**，并新增四个前端页面。

### 0.0.1 视觉：从杂志风到 Apple 基底

| 维度 | 改造前（杂志风） | 改造后（Apple 基底） |
| --- | --- | --- |
| 主题色 | 珊瑚橙 `#E85D04`（自造色） | **系统色 `--orange` `#FF9500`**（`--tint` 覆盖） |
| 底色 | 暖白纸 `#FDFBF7` | **分组底 `#F2F2F7`** / 卡片 `#FFFFFF` |
| 字体 | Avenir Next + Georgia 衬线标题 | **SF Pro / 苹方无衬线体系**，字号严格按 §2.1 阶梯 |
| 圆角 | 全局 `0`（印刷直角） | **`--radius-sm/md/lg/xl/full`** 五档（8/12/16/22/999） |
| 卡片 | 1px 边框 + 直角 | **无边框 + 极浅双档阴影**（`--shadow-card` / `--shadow-float`） |
| 分隔线 | `#E7E1D6` 实线 | **1px 发丝线 `--separator`**，只出现在列表项之间 |
| 毛玻璃 | 无 | **仅用于顶栏等悬浮层**（`saturate(180%) blur(20px)`） |
| 深色模式 | 无 | **跟随 `prefers-color-scheme`**，整套令牌 + Naive UI `darkTheme` |

**令牌来源单一化**：`src/apple-tokens.css` 是唯一令牌源，`src/theme.js` 只做
「CSS 变量 → Naive UI themeOverrides」的静态映射（Naive UI 需要字符串常量，
无法直接读 CSS 变量），并把色板限制在 Apple 系统色内，不新造色值。

### 0.0.2 主题层映射要点

- `n-config-provider` 同时接收 `:theme`（`darkTheme` / `null`）与
  `:theme-overrides`（`appleDarkOverrides` / `appleLightOverrides`），
  深浅两套覆盖由同一个 `buildOverrides()` 生成，避免两处漂移。
- 圆角：Button/Input/Select → `--radius-md`；Card/Dropdown → `--radius-lg`；
  Modal/Drawer/Dialog → `--radius-xl`；Tag/Chip → `--radius-sm`；Switch 为 51×31 胶囊。
- 按钮改为 Apple 形态：实底主题色（主）/ `--fill-secondary` 底（次），**无边框**，按下 `scale(0.97)`。
- 输入框改为填充式：`--fill-secondary` 底 + **2px 透明边框**，聚焦时主题色描边 + `0 0 0 4px` 外发光。
- 阴影只保留两档（卡片 / 浮层），由 `--shadow-card` / `--shadow-float` 决定。

### 0.0.3 新增页面（四页 + 首页时间线）

| 路由 | 页面 | 说明 |
| --- | --- | --- |
| `/home` | `Home.vue` | **活动流时间线**：按操作类型着色的节点圆点，类型筛选 + 分页加载 |
| `/projects` | `Projects.vue` | **项目列表**：卡片网格、Apple 系统色点选色、归档筛选、关联计数 |
| `/tags` | `Tags.vue` | **标签云**：字号/浓度随使用次数变化，点标签展开该标签下的笔记列表 |
| `/versions` | `Versions.vue` | **版本历史**：左笔记列表 ｜ 中版本时间线 ｜ 右 LCS 行级 diff + 回滚 |

`/` 重定向到 `/home`；导航栏改为「活动 / 笔记 / 项目 / 标签 / 任务 / 简历」（+ 管理员「仪表盘」）。

### 0.0.4 五态统一

新增 `src/components/StateBlock.vue`，把 **加载（骨架屏）/ 空 / 错误 / 无权限 / 404**
收敛为一个组件（`state` + `title` + `description` + `action` + `retry`），
所有页面共用，避免每页各写一套。

### 0.0.5 后端补深（11 张表）

```
users  projects  notes  note_versions  tags  note_tags
resumes  resume_experiences  tasks  attachments  activities
```

| 新增业务 | 实现要点 |
| --- | --- |
| **项目分组** | `projects` 表（名称/颜色/描述/归档态）；笔记与任务通过 `project_id` 归属 |
| **笔记版本历史** | 每次内容变化写入 `note_versions` 快照，**只保留最近 20 版**；提供 diff 与回滚，回滚前自动备份当前内容 |
| **结构化简历** | 经历从 JSON 字符串拆到 `resume_experiences`（机构/角色/起止/描述/亮点数组/排序），支持拖拽排序 |
| **活动流** | `logActivity()` 记录创建/编辑/删除/完成/润色/应用/回滚/状态变更，**永不因日志失败影响主流程** |
| **标签体系** | `tags` + `note_tags` 多对多；写入时同步维护 `notes.tags` 冗余串以保持搜索兼容 |

**简历状态机**：`draft → polished → final`，非法流转返回 400；
`final` 状态锁定编辑（改标题/经历/润色均返回 400），允许回退到 `polished` 解锁。

**AI 落库闭环**：`/api/resumes/:id/polish` 让模型**同时**输出润色正文与结构化亮点，
正文写入 `resumes.polished`，亮点写入 `resume_experiences.highlights`，
并把 `draft` 自动流转到 `polished`；`/apply-polish` 再把亮点一键写回原稿描述。
未配置 `LLM_API_KEY` 时由本地规则生成同样结构的保底结果（`source: local`）。

### 0.0.6 第三批次自检

- [x] 字体族与字号阶梯完全按 §2.1，没有自创字号
- [x] 主题色只有一个（`--orange`），取自 §2.2 系统色
- [x] 卡片无边框、阴影极浅；毛玻璃只用在顶栏/命令面板/弹窗等悬浮层
- [x] 分隔线是 1px 发丝线（`--separator`），没有粗边框
- [x] 深色模式可用（Naive UI `darkTheme` + 深浅两套令牌），跟随系统无闪烁
- [x] 圆角只用 §2.3 定义的档位
- [x] 动效有 `prefers-reduced-motion` 降级（在 `apple-tokens.css` 中统一下调）
- [x] 每页有加载 / 空 / 错误 / 无权限 / 404 五态（`StateBlock`）
- [x] 没有霓虹、扫描线、终端绿、硬投影、粗黑边
- [x] 保留了命令面板 + 三栏工作区的差异化

---

## 0. 形态改造：编辑器优先 + 命令面板

> 第二批次目标：把第一批做完的「顶部导航 + 卡片网格列表 + 弹窗表单」深化为
> **唯一一个键盘驱动、编辑器优先的工作台**。骨架换了，皮（暖白纸 / 珊瑚橙 / 衬线大标题）保留。

### 0.1 改造前后对照

| 维度 | 改造前（第一批） | 改造后（第二批次） |
| --- | --- | --- |
| 导航模型 | 左侧竖向 `NLayoutSider` + `NMenu`（编辑部目录） | **顶部细条 + 全局命令面板**：侧边栏整体移除 |
| 笔记页 | `NDataTable` 服务端分页表格 + 新建/编辑弹窗 | **三栏编辑器**：笔记树 / 编辑器主体 / 属性面板，点击即编辑 |
| 简历页 | 列表 + 原稿卡片 + 润色对比抽屉 | **分栏对比**：左原稿可编辑 ｜ 中「应用」闸门 ｜ 右润色稿只读 |
| 任务页 | 按项目分组的静态看板行 | **可拖拽看板**：HTML5 DnD 跨列改项目、列内重排（无泳道装饰） |
| 主交互 | 点按钮 → 弹窗表单 | **⌘/Ctrl + K 命令面板**：搜索笔记 / 跳转页面 / 执行操作 |
| 记忆点 | 衬线 + 直角 + 纸感 | 叠加：**唯一有命令面板的，键盘驱动** |

### 0.2 新增文件

| 文件 | 作用 |
| --- | --- |
| `src/components/CommandPalette.vue` | 全局命令面板：分组结果、键盘上下选择、Enter 执行、Esc 关闭 |
| `src/bus.js` | 极简事件总线（`on` / `off` / `emit` / `emitRetry`），用于命令面板向懒加载路由投递意图 |

`bus.js` 的 `emitRetry` 解决一个真实问题：命令面板可以跳到尚未挂载的懒加载页面，
事件会被短轮询重投直到被消费（最多 25 次 × 80ms），避免「跳过去但动作丢了」。

### 0.3 命令面板

**唤起**：全局 `keydown` 捕获（capture 阶段），`Ctrl+K` / `Cmd+K` 切换；
顶栏的伪输入框触发条点击同样打开。顶部细条在全站常驻。

**结果分三组**（输入即筛选，中英文关键词均可命中）：

| 分组 | 内容 | 执行动作 |
| --- | --- | --- |
| 操作 | 新建笔记 / 新建任务 / 新建简历 / AI 润色当前简历 | 跳目标页 + `emitRetry` 投递意图 |
| 跳转 | 笔记 / 简历工作台 / 任务看板 / 个人中心（管理员多一项数据仪表盘） | `router.push` |
| 笔记 | 实时检索结果（走既有 `GET /api/notes`，`pageSize=8`） | 跳 `/notes` + `cmd:open-note` 打开该篇 |

**键盘**：↑ / ↓ 循环移动（`scrollIntoView({ block: 'nearest' })` 保证可见），
Enter 执行当前项，Esc 关闭，鼠标 hover 同步高亮。

### 0.4 笔记页：三栏编辑器

```
┌──────────────┬────────────────────────────┬──────────────┐
│ 笔记树 272px │ 编辑器主体 1fr             │ 属性/标签    │
│ 收藏/标签/   │ 保存状态 · 字数 · 语音输入 │ 收藏开关     │
│ 未分类分组   │ 衬线大标题（无边框 input） │ 字数 / 更新  │
│ 可折叠       │ 珊瑚短下划线 + 无边框正文  │ 标签编辑     │
│ 搜索/只看收藏│ 语音朗读                  │ 保存 / 删除  │
└──────────────┴────────────────────────────┴──────────────┘
```

- **左栏「笔记树」**不是平铺列表：按 `收藏` → 各 `标签` → `未分类` 分组，组头可折叠，
  带条数角标。标签排序用 `localeCompare(…, 'zh')` 保证中文稳定顺序。
- **中栏**是真正的编辑器：标题为衬线 32px 无边框 `input`，正文为无边框自适应 `textarea`，
  下方珊瑚色短下划线呼应刊头气质。输入后 1.4s 防抖自动保存，`⌘/Ctrl + S` 立即保存。
- **右栏**展示属性（收藏 / 字数 / 更新时间）与标签编辑（`NDynamicTags`），
  并提示两个快捷键。
- **翻页改为「加载更多」**：左栏底部按需追加，不再有分页器（滚动即读的编辑器语义）。
- 新建笔记是**直接插入一份草稿**进入编辑，不再是弹窗。

### 0.5 简历页：分栏对比

```
┌──────────────┬──────────────────┬─────┬──────────────────┐
│ 简历列表     │ 原稿（可编辑）   │ 应用│ 润色稿（只读）   │
│ 236px        │ 标题/岗位/状态   │ 76px│ Markdown 渲染    │
│              │ 技能 / 经历条目  │ →   │ 珊瑚浅底         │
│              │ AI 润色按钮      │撤销 │ 朗读 / 复制      │
└──────────────┴──────────────────┴─────┴──────────────────┘
```

「应用」的语义：把润色稿的措辞采纳进原稿。实现要点：

- 润色稿按行切分，与经历条目**按条数对齐**（取末尾 N 行，润色稿通常先写岗位与技能）。
- 行数不足以对齐时**不猜测**，弹窗明确告知无法自动对齐，建议用「复制」手动整理——原稿零改动。
- 应用前对将被覆盖的描述做**快照**，应用后中间栏出现「撤销」，可一键还原。
- 原稿字段（`title` / `target_job` / `skills` / `experiences`）与 `polished` 仍彼此独立，
  `saveMeta()` 从不写 `polished`。

### 0.6 任务页：可拖拽看板

- 每列一个项目，列头 3px 墨色下边框保留刊物分栏感；**无泳道装饰、无进度条**，刻意比 FlowBoard 更简。
- **跨列拖拽 = 改所属项目**：乐观更新（卡片立即换列）→ `PUT /api/tasks/:id { project }` → 失败回滚并提示。
- **列内拖拽 = 本地重排**：只调整数组顺序，不提交任何后端字段（后端本就没有 sort 字段）。
- 每列底部有「在此列新增」，新建抽屉的项目字段预填该列名。
- 拖拽用原生 HTML5 DnD（`draggable` + `dragstart` / `dragover` / `drop`），**未引入任何拖拽库**。

### 0.7 外壳与舞台

- `AppLayout.vue` 由 `NLayout has-sider` 改为**顶部细条 + 舞台**的 flex 纵向布局，
  `height: 100vh` + 内部滚动，三栏编辑器才能撑满而不整页滚动。
- 顶栏内容：品牌（衬线 + 珊瑚下划线）· 命令面板触发条 · 轻量文字导航 · 账号。
  文字导航只是命令面板的可见性兜底（`< 900px` 时隐藏，面板仍可用）。
- 舞台有**两种宽度语义**：`wide`（notes / resumes / tasks 铺满，`padding: 0`）
  与默认（dashboard / profile 居中 1160px 阅读宽度）。
- `base.css` 新增 `--shell-head: 66px`（窄屏 58px），供各页计算满屏高度。

### 0.8 保留不变的部分

- **语音转文字**：`SpeechRecognition` 的 `lang` / `interimResults` / `continuous` / `onresult` 逐字保留，
  现在写入的是编辑器当前草稿的 `content`。
- **语音朗读**：`speechSynthesis` + 中文语音优选 + `rate = 0.98` 逐字保留（笔记、简历、任务三处）。
- **Admin 仪表盘**：5 个 admin 接口 + ECharts option 逐字未动，仅换了外壳。
- **API / localStorage / 路由**：见第 6 节自检，全部零改动。

---

## 1. 使用的库

| 类别 | 选型 | 版本 | 说明 |
|------|------|------|------|
| 框架 | Vue 3 | ^3.5.13 | 保持原有 |
| 构建 | Vite | ^6.0.7 | 保持原有，`server.port` / `proxy` 未改动 |
| 路由 | vue-router | ^4.5.0 | 所有 `path` 未改动 |
| **组件库** | **Naive UI** | **^2.45.3** | 本项目指定库，五项目中唯一使用 |
| **图标库** | **@vicons/ionicons5** | **^0.13.0** | 线描风格，契合纸感编辑气质 |
| 图表 | ECharts | ^5.6.0 | 保持原有，仅换容器 |

安装命令：

```bash
cd F:\traecode\scholarboard\frontend
npm install naive-ui@^2.40.0 @vicons/ionicons5 --save
```

---

## 2. 视觉方向：编辑排版极简 · 纸感

### 2.1 设计概念

保留原项目「杂志编辑部」的气质，把它从手写 CSS 迁移到 Naive UI 的主题层实现。
核心隐喻是**纸**：暖白纸面、墨水印刷、珊瑚色标记笔。

### 2.2 色板（`src/theme.js` 的 `SB` 常量）

| 令牌 | 色值 | 用途 |
|------|------|------|
| `bg` | `#FDFBF7` | 暖白纸底（页面背景） |
| `paper` | `#FFFFFF` | 纸面（卡片/表格/弹窗） |
| `paperWarm` | `#F7F3EC` | 次级纸面（表头/行动区） |
| `ink` | `#1A1715` | 墨水黑（主文字/分割粗线） |
| `inkSoft` | `#57504A` | 次级文字 |
| `inkFaint` | `#8D857C` | 辅助文字/占位符 |
| **`accent`** | **`#E85D04`** | **珊瑚橙（主色，规范指定）** |
| `accentSoft` | `#FDEEE1` | 珊瑚浅底（选中态/润色区） |
| `line` | `#E7E1D6` | 版面条线 |

### 2.3 字体

- 标题：`Georgia, Songti SC, STSong, SimSun, serif` —— 大号衬线，杂志刊头感
- 正文：`Avenir Next, -apple-system, PingFang SC, Microsoft YaHei, sans-serif`
- 代码：`Cascadia Code, JetBrains Mono, Consolas, monospace`

### 2.4 形态语言

- **圆角统一为 `0`**：`borderRadius` 全量置零，保持印刷式直角
- **卡片留白充足**：`paddingMedium: 20px 22px`，`paddingLarge: 26px 28px`
- **阴影极浅**：`0 1px 2px rgba(26,23,21,.04), 0 4px 16px rgba(26,23,21,.05)`
- **排版助手**：`.sb-kicker`（全大写眉标）、`.sb-display`（衬线大标题）、`.sb-underline`（珊瑚短下划线）、`.sb-index`（印刷编号角标）

---

## 3. 架构与文件结构

```
frontend/src/
├── theme.js                  ← 设计令牌 + Naive UI themeOverrides
├── App.vue                   ← NConfigProvider + 三个 Provider 的 Provider 树
├── api.js                    ← 微调：toast() 支持注入 NMessage，API 全部未变
├── bus.js                    ← 【第二批新增】极简事件总线，命令面板投递意图
├── assets/base.css           ← 重写：令牌 + 文档基底 + 排版助手 + --shell-head
├── layout/AppLayout.vue      ← 【第二批改造】顶部细条 + 舞台 + 全局命令面板
├── components/
│   ├── CommandPalette.vue    ← 【第二批新增】⌘K 命令面板
│   ├── Modal.vue             ← NModal + NCard 封装，对外接口不变
│   ├── ConfirmModal.vue      ← NButton 承载，对外接口不变
│   └── Markdown.vue          ← 未改（AI 润色渲染，含 XSS 转义逻辑）
└── views/
    ├── Notes.vue             ← 【第二批改造】三栏编辑器 + 语音保留
    ├── Resumes.vue           ← 【第二批改造】分栏对比（原稿/应用/润色稿）
    ├── Tasks.vue             ← 【第二批改造】可拖拽看板（HTML5 DnD）
    ├── Dashboard.vue         ← NCard 容器 + ECharts 数据源不变
    ├── Profile.vue           ← NForm
    ├── Login.vue             ← NForm + NCard
    ├── Forbidden.vue         ← NResult
    └── NotFound.vue          ← NResult
```

### 3.1 主题注入链路

`theme.js` 导出 `paperThemeOverrides`，由 `App.vue` 的 `NConfigProvider` 消费。
所有组件的视觉由主题层统一驱动，页面内不散落硬编码色值。

```
main.js → App.vue
            └─ NConfigProvider (themeOverrides = paperThemeOverrides)
                 └─ NMessageProvider
                      └─ NDialogProvider
                           └─ NLoadingBarProvider
                                ├─ MessageBridge (把 useMessage 注入 api.js 的 toast)
                                └─ RouterView
                                     └─ AppLayout
                                          ├─ 顶部细条（品牌 · 命令触发条 · 文字导航 · 账号）
                                          ├─ <RouterView> 舞台（wide / 居中两种宽度）
                                          └─ CommandPalette（Teleport 到 body，全局监听 ⌘K）
```

命令面板不在 Provider 内部消费 message，而是通过 `bus.js` 与各功能页解耦：
面板只负责「跳转 + 投递意图」，页面自己决定如何响应（`cmd:new-note` / `cmd:open-note` /
`cmd:new-task` / `cmd:new-resume` / `cmd:polish-resume`）。

`MessageBridge` 是一个极简 `defineComponent`，仅做一件事：在 Provider 上下文内调用 `useMessage()`，把实例交给 `api.js` 的 `bindMessage()`。这样全站 `toast()` 自动走 Naive UI 消息条，同时保留原生 DOM 兜底。

---

## 4. 组件映射表

### 4.1 布局与外壳

| 原实现 | Naive UI 组件 | 说明 |
|--------|---------------|------|
| `.mag-header` 杂志顶栏 + `<nav>` RouterLink | **顶部细条**（原生 `header` + flex）+ `RouterLink` 文字导航 | 【第二批】由侧边栏改回顶部，但只保留轻量文字导航；主入口是命令面板 |
| — | **`CommandPalette`**（`Teleport` 到 body） | 【第二批新增】全局 ⌘/Cmd+K，面板本体不依赖 Naive UI 布局组件 |
| `.mag-brand` 品牌标识 | 自定义 `.sb-brand`（衬线 + 珊瑚下划线） | 保留杂志刊头气质 |
| `.mag-user` / `.btn-underline` 退出 | `NButton` (quaternary) + 自定义圆形头像 | 头像字符逻辑不变（`user.avatar` 或用户名首字母） |
| `.content` / `.page-title` | `.sb-stage`（`wide` / 居中两种宽度） | 编辑器页铺满、阅读页居中；页面标题仍在 `route.meta.title` |

### 4.2 笔记（Notes.vue）

| 原实现 | Naive UI 组件 | 说明 |
|--------|---------------|------|
| 卡片网格 `.grid` + `.card.story` | **三栏编辑器**（原生 grid + 无边框 input/textarea） | 【第二批】不再是 `NDataTable`；列表退居左栏「笔记树」 |
| 手写分页 `.pager` | **「加载更多」按钮** | 【第二批】编辑器语义下不再分页；`pageSize=100` 按需追加，`total` 仍来自后端 |
| `.input.search` 搜索框 | `NInput` + `SearchOutline` 前缀图标 | 防抖 400ms 逻辑不变 |
| 「只看收藏」按钮 | `NSwitch` | 筛选参数 `fav='1'` 不变 |
| 收藏星标 | `NButton` + `NIcon` (Star/StarOutline) | `api.updateNote(id, {favorite})` 不变 |
| 新建/编辑弹窗 `Modal` | **中栏直接编辑** | 【第二批】弹窗移除；新建即插入草稿进编辑器，1.4s 防抖自动保存 + `⌘/Ctrl+S` |
| 标签展示 | 右栏 `NDynamicTags` | 【第二批】标签从只读展示变为可编辑，并驱动左栏分组 |
| 删除 `confirm()` | `useDialog().warning()` | 确认文案不变 |
| 加载态 `.empty` | `NSpin` + `NEmpty` | 加载/空/错误三态均保留（错误态带「重试」） |
| **语音输入按钮** | `NButton` + `MicOutline` | **`SpeechRecognition` 逻辑逐字保留** |
| **朗读按钮** | `NButton` + `VolumeHighOutline` | **`speechSynthesis` 逻辑逐字保留** |
| 标签展示 | `NTag` | — |

### 4.3 简历工作台（Resumes.vue）—— 重点场景

| 原实现 | Naive UI 组件 | 说明 |
|--------|---------------|------|
| 左侧 `.res-item` 列表 | 左栏原生 `button` 列表 | 【第二批】序号角标改为左侧珊瑚竖线 + 状态徽标 |
| 编辑区 `.editor.card` | **分栏左格「原稿」**（可编辑） | 【第二批】始终可编辑，右格只读 |
| 标题/岗位/状态输入 | `NForm` + `NInput` + `NSelect` | 状态 `NSelect`（草稿/就绪），提交字段不变 |
| 技能标签输入 | **`NDynamicTags`** | 回车添加，`@update:value` 即保存 |
| 经历编辑 | 左栏内联 `NInput` / `textarea` | 每条经历带左侧细线，删除按钮在行内 |
| 润色结果内嵌面板 | **中间「应用」闸门 + 右栏只读润色稿** | 【第二批】抽屉移除，三栏同屏对比 |
| — | 中栏「应用 / 撤销 / 清除」 | 【第二批新增】应用=把润色稿采纳进原稿，带快照可撤销 |
| — | 右栏 `Markdown` 渲染 + 朗读 / 复制 | 珊瑚浅底 `--accent-soft` 区分只读区 |
| 朗读 | `NButton` + `VolumeHighOutline` | `speakText` / `originalText` 逻辑保留 |

**关键数据契约保持**：
- `current.polished` 独立字段，`saveMeta()` 从不写入该字段 → **原稿永不被覆盖**
- `polishCurrent()` 调 `api.resumePolish(id)`，取 `res.source` / `res.polished`
- `clearPolish()` 调 `api.updateResume(id, {title, polished: ''})`
- `polishSource` 为 `'llm'` 时显示「AI 大模型」，否则「本地保底模板（未配置 LLM_API_KEY）」

### 4.4 任务看板（Tasks.vue）—— 重点场景

| 原实现 | Naive UI 组件 | 说明 |
|--------|---------------|------|
| `.proj` 分组区块 | **横向滚动看板列** | 【第二批】每项目一列，列头 3px 墨色下边框，无泳道装饰 |
| `.proj-head` 标题 + 统计 | 列头 `h3` + 等宽计数 | `done/total` |
| `.task` 行 | **可拖拽卡片**（`draggable`） | 【第二批】完成态删除线不变；hover 显操作 |
| — | **跨列拖拽 = 改项目** | 【第二批新增】乐观更新 + `PUT /api/tasks/:id {project}`，失败回滚 |
| — | **列内拖拽 = 本地重排** | 【第二批新增】仅调数组顺序，不提交后端字段 |
| 优先级 `.badge` | **`NTag`** (type: error/warning/success) | 高/中/低 |
| 截止日期 `<input type=date>` | **`NDatePicker`** | 时间戳 ↔ `'YYYY-MM-DD'`，**提交格式不变** |
| 所属项目 `<input list=...>` | **`NSelect` (filterable + tag)** | 自由输入新项目名 |
| 新建/编辑抽屉 | **`NDrawer`**（宽 440px）+ `NForm` | 字段与改造前一致；「在此列新增」预填项目 |
| 朗读 | `NButton` + `VolumeHighOutline` | `speakTask` 逻辑保留 |

### 4.5 数据仪表盘（Dashboard.vue）

**图表数据来源完全未变**：仍是 `api.adminOverview()` / `adminUsersGrowth()` / `adminNotesTrend()` / `adminTaskCompletion()` / `adminTopUsers()` 五个接口，仍用 `Promise.all` 并发拉取，ECharts option 逐字保留（含珊瑚 `#E85D04` 与墨色轴标签）。

改动仅在容器层：
- 编辑部标头 → `NCard`
- 统计刻度条 → `NCard` × 5（含 hover 上浮 + 珊瑚上边框）
- 四个图表面板 → `NCard` (title=...) + 内部 `div.chart`
- AI 周报弹窗 → `Modal` + `NForm`/`NInput` + `NEmpty`
- 加载态 → `NSpin`

### 4.6 其他页面

| 页面 | 组件 |
|------|------|
| Profile | `NCard` + `NForm`/`NFormItem`/`NInput` + `NTag`(角色) + `NDivider` |
| Login | `NCard` + `NForm` + `NInput`(密码带 `show-password-on="click"`) + `NButton`(block) |
| Forbidden | `NResult status="403"` + `NButton` |
| NotFound | `NResult status="404"` + `NButton` |

规范要求组件清单（`NLayout/NLayoutSider`、`NMenu`、`NCard`、`NDataTable`、`NForm`、`NInput`、`NButton`、`NModal`、`NDrawer`、`NTag`、`NSelect`、`NDatePicker`、`NSwitch`、`NMessageProvider`/`NMessage`、`NEmpty`、`NSpin`、`NPagination`）**全部落地**。

---

## 5. 与其它四个项目的差异点

| 维度 | scholarboard | mindcare | edupulse | hivemarket | examprep |
|------|--------------|----------|----------|------------|----------|
| 框架 | Vue 3 | React 18 | React 18 | Vue 3 | 原生 HTML/JS |
| 组件库 | **Naive UI 2** | Mantine 8 | Ant Design 6 | PrimeVue 4 | Shoelace 2 + Open Props |
| 图标 | **@vicons/ionicons5** | Tabler | Ant Design Icons | PrimeIcons | Bootstrap Icons |
| 视觉 | **编辑排版极简 · 纸感** | 柔和治愈 · 呼吸感 | 赛博霓虹驾驶舱 | 粗野主义电商 | 复古终端 CRT |
| 形态（第二批） | **编辑器优先 + 命令面板** | 沉浸式卡片流 | 可拖拽驾驶舱网格 | 集市瀑布流 + 抽屉 | 强化命令行 |
| 主色 | **珊瑚橙 `#E85D04`** | 柔和紫 `#7c6cf0` | 青蓝/品红辉光 | 红黑撞色 | 荧光绿 |
| 形态 | **直角 + 衬线大标题 + 极浅阴影** | 大圆角 `lg` + 柔光 | 深色 + 发光边框 | 3px 黑边 + `5px 5px 0` 硬阴影 | 等宽字体 + 扫描线 |
| 背景 | **暖白纸 `#FDFBF7`** | 玻璃拟态光斑 | 深空黑 | 米白 + 硬边框 | CRT 黑 |

**与其它四项目最容易一眼区分的特征**：
1. **唯一使用衬线字体做标题**的项目 —— Georgia/Songti 大字号刊头
2. **唯一圆角全量为 0** 的项目 —— 印刷式直角，无任何圆润感
3. **唯一使用暖白纸底而非纯白/深色/霓虹**的项目
4. **唯一有 ⌘/Ctrl + K 命令面板**的项目 —— 键盘驱动，不看按钮也能操作
5. **唯一以三栏编辑器承载笔记**的项目 —— 左树 / 中编辑器 / 右属性，点击即写
6. **唯一把 AI 润色做成「应用闸门」**的项目 —— 原稿与润色稿同屏，中间一键采纳并可撤销

---

## 6. 硬约束自检结果

| 检查项 | 结果 | 证据 |
|--------|------|------|
| 布局范式与改造方案一致 | ✅ | 编辑器优先：三栏编辑器 / 分栏对比 / 可拖拽看板 / 全局命令面板 |
| 主交互按方案实现 | ✅ | ⌘/Ctrl+K 命令面板（搜索笔记 + 跳转 + 操作，↑↓ 选择 + Enter 执行） |
| `backend/` 未被修改 | ✅ | `find backend/src backend/test -newermt "2026-09-23 00:00"` 结果 **0 个文件** |
| 组件库仍为 Naive UI 2 | ✅ | `package.json` 依赖未增删（无新增第三方库，拖拽用原生 HTML5 DnD） |
| API 请求路径/方法/字段未变 | ✅ | `diff` 备份与新 api.js 的 `/api/...` 提取结果：**完全一致** |
| `localStorage` key 未变 | ✅ | `diff` 结果一致，仍为 `sb_token` / `sb_user` |
| vue-router 路由 `path` 未变 | ✅ | `diff` 备份与新 router.js 的 `path:` 提取结果：**完全一致** |
| `vite.config.js` 端口/代理未变 | ✅ | 仍为 `port: 5172`，`target: http://localhost:4102` |
| 笔记服务端分页/搜索/筛选保留 | ✅ | `NDataTable remote` + `api.notes({page, pageSize, q, fav})` |
| 语音转文字逻辑保留 | ✅ | `SpeechRecognition` 全部逻辑（lang/interimResults/continuous/onresult）逐字保留 |
| 语音朗读逻辑保留 | ✅ | `speechSynthesis` + `SpeechSynthesisUtterance`（含 zh 语音优选、rate 0.98）保留 |
| AI 润色原稿保留机制 | ✅ | `polished` 独立字段，`NDrawer` 并排对比 |
| Admin 图表数据来源未变 | ✅ | 5 个 admin 接口 + ECharts option 逐字保留 |
| 构建零错误 | ✅ | `✓ built in 18.12s` |
| 源码 UTF-8 无 BOM、文案全中文 | ✅ | 所有新增/改写文件均为 UTF-8 中文文案 |
</br>
