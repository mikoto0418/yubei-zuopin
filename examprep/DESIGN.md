# ExamPrep · 前端设计文档

> 本文档记录 ExamPrep 前端在「十套系统统一到 Apple 设计基底」改造中的设计决策。
> 上一版是「复古终端 CRT」风格，本版**已彻底删除**该风格。

---

## 一、设计方向总览

| 项 | 取值 |
| --- | --- |
| 设计语言 | **Apple 设计语言基底**（共享令牌层 `css/apple-tokens.css`） |
| 主题色 | `--tint: var(--yellow)`（Apple 系统黄 `#FFCC00`） |
| 差异化维度 | **时间块日历（30 分钟粒度 + 拖拽） + 命令行驱动** |
| 字体 | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", ...`（无衬线） |
| 底/卡片 | 分组底 `#F2F2F7` / 白卡片 `#FFFFFF`（深色 `#0D0D0F` / `#1C1C1E`） |
| 圆角 | 只用 `--radius-sm/md/lg/xl/full` 五档令牌 |
| 分隔 | 1px 发丝线 `var(--separator)`，不用粗边框 |
| 深色模式 | `prefers-color-scheme` 自动切换，无闪烁 |

### 1.1 为什么换掉 CRT

原风格（深黑墨绿底 + 荧光绿等宽字 + 扫描线 + 眩光 + 光标闪动 + 方框字符边框）单看有个性，
但**在评审投影仪上偏暗偏刺眼**，且与其余九套产品「像十个不同年代的产品」。
统一到 Apple 基底后，十套产品看起来像同一个设计团队做的不同 App，专业度提升一档；
差异化改为靠**独有的交互范式 + 一个克制的主题色**。

### 1.2 删除清单（逐项核对）

| 原 CRT 元素 | 处置 |
| --- | --- |
| `.crt-overlay` / `.scanlines` 扫描线与眩光 | **删除**（DOM 与 CSS 全部移除） |
| 光标闪动 / 呼吸动画 | **删除**（改为 Apple 标准入场动画） |
| 方框字符边框（`+---+` 式） | **删除**（改为白卡片 + 极浅阴影） |
| 等宽字体 `Courier New` / `Consolas` | **删除**（改为系统无衬线；仅代码块保留 `--font-mono`） |
| 深黑墨绿底 `#0a0f0a` | **删除**（改为 `--bg-grouped`） |
| 荧光绿 `#33ff66` / 青色 `#00ffc8` / 琥珀 `#ffb454` | **删除**（改用 Apple 系统色） |
| 顶部 `.ticker` 滚动字幕条 | **删除** |
| 命令行绿色荧光配色 | **删除**（改为浅色命令面板 + 发丝线分隔） |
| `class="sl-theme-dark"` 强制深色 | **删除**（改为跟随系统，并用 JS 同步 `sl-theme-dark` 类） |

> 校验方式：`grep -inE 'scanline|crt-|terminal|#0a0f0a|33ff66|00ffc8|Courier|ticker'` 在 `index.html` / `style.css` / `app.js` 中**零命中**。

---

## 二、保留的差异化：命令行 + 时间块日历

规范要求「保留命令行 + 时间块日历这个差异化」，本版完整保留交互，只把视觉压到 Apple 基底之下。

### 2.1 时间块日历（主视觉差异点）

**布局**：左侧时间刻度轴（`--cal-label-w: 56px`）+ 右侧时间块区（`.cal-day`）。
单格高度 `--cal-hour-h: 56px`，即 **30 分钟 = 28px**，与后端 30 分钟粒度严格对应。

- **网格自适应**：渲染前扫描当天时间块，把可视范围收缩到 `[最早整点, 最晚整点]`，无数据时回退 `06:00–23:00`。
- **时间块定位**：绝对定位 + `top`/`height` 按分钟换算像素；最小高度 24px 保证 30 分钟块可点击。
- **状态着色**（唯一允许的颜色语义）：
  - `planned` — 主题色描边 + `--tint-soft` 底
  - `in_progress` — 橙色描边
  - `done` — 绿色描边 + 标题划线
  - `skipped` — 灰色描边 + 降透明度 + 划线
- **拖拽**：HTML5 `draggable`（仅 `planned` / `in_progress` 可拖）
  - 日视图内拖动 → 按落点 y 坐标反算开始时间，**四舍五入到 30 分钟**，保持原时长，调 `/schedule` 接口
  - 周视图跨列拖动 → 改 `block_date`
  - 冲突与粒度由后端校验，前端 toast 呈现错误原文
- **周视图**：7 列 + 当日圆点标记 + 每列时间块缩略卡（`.mini`），同样可拖拽跨天。

### 2.2 命令行（记忆点）

规范要求「命令行区域改成 Apple 风格的命令面板（浅色、圆角、发丝线分隔）」。

- 底部是**真实可输入的 `sl-input`**（`exam-prep ›` 提示符），不是装饰。
- **输入框保留前缀提示符**，但颜色为主题色（非荧光绿），面板是白底 + 圆角 + 顶部发丝线。
- **自动补全**：输入前缀时输入框上方浮出候选面板（`--radius-lg` + `--shadow-float`），
  显示「命令 + 中文说明」；`Tab`/`Enter` 接受，`↑↓` 选择，`Esc` 关闭，鼠标可点。
- **打字机输出**：输出到主区下方 `.console` 区，逐行 9ms/字符落字；长文本（>240 字符）一次性落字。
  输出分级用 **Apple 语义色**：`.ok` 绿 / `.warn` 橙 / `.err` 红 / `.head` 主文字加粗 / `.echo` 主题色提示符。
- **历史**：`↑` 无候选时翻会话历史（上限 200 条）。

---

## 三、组件库适配（Shoelace → Apple）

Shoelace 的品牌辨识度保留（评审能看出用了 Web Components 库），视觉语言通过**主题层**压到 Apple 基底之下。

```css
:root {
  --sl-color-primary-600: var(--tint);
  --sl-border-radius-medium: var(--radius-md);
  --sl-input-background-color: var(--fill-secondary);
  --sl-input-border-color: transparent;
  --sl-panel-background-color: var(--bg-surface);
  --sl-shadow-medium: var(--shadow-card);
}
```

| Shoelace 部件 | 适配方式 |
| --- | --- |
| `sl-button::part(base)` | 无边框、`--radius-md`、按下 `scale(0.97)`；`default` 为填充式主题色文字 |
| `sl-input` / `sl-textarea` / `sl-select` | **填充式**（`--fill-secondary` 底、无边框），聚焦 2px 主题色描边 + `0 0 0 4px var(--tint-soft)` 外发光 |
| `sl-card` | 去边框、`--radius-lg`、`--shadow-card` |
| `sl-dialog` | 面板 `--radius-xl` + `--shadow-float`；遮罩 `rgba(0,0,0,.32)` + `blur(2px)`；标题区发丝线 |
| `sl-tab-group` | 导航区发丝线；激活指示条 2px 主题色 |
| `sl-details` / `sl-badge` / `sl-alert` | 去边框、圆角令牌化 |

**黄色主题的对比度处理**：`#FFCC00` 作底时白字对比度不足，故实底按钮统一用 `--tint-on: rgba(0,0,0,.9)` 近黑字，保证正文对比度 ≥ 4.5:1。

### 3.1 深色模式的 Shoelace 桥接

Shoelace 的 `dark.css` 用 `:host, .sl-theme-dark` 选择器，仅加载 CSS 不够。
解决：`<head>` 内联一段脚本，按 `matchMedia('(prefers-color-scheme: dark)')` 同步根元素类名，并监听变化。

```js
var mq = window.matchMedia('(prefers-color-scheme: dark)');
var sync = function () { document.documentElement.classList.toggle('sl-theme-dark', mq.matches); };
sync();
mq.addEventListener('change', sync);
```

配合两个 `<link media="(prefers-color-scheme: ...)">` 引入 `themes/light.css` / `themes/dark.css`，切换无闪烁。

---

## 四、页面与五态

### 4.1 视图清单（12 个）

| # | 视图 key | 名称 | 说明 |
| --- | --- | --- | --- |
| 1 | `calendar` | 时间块日历 | 默认落地页；日/周切换、拖拽、状态流转 |
| 2 | `plan` | 备考计划 | 文字版计划 + AI 生成 + 语音朗读 |
| 3 | `exam` | 模考记录 | 录入表单 + 趋势/各科图表 + 列表 |
| 4 | `wrong` | 错题本 | KPI + 录入 + 状态筛选 + 重做/掌握 |
| 5 | `material` | 学习资料库 | KPI + 录入 + 进度条 + 状态筛选 |
| 6 | `reminder` | 提醒中心 | KPI + 扫描补做 + 状态流转 |
| 7 | `quiz` | 做题追踪 | 录入 + 记录 / 正确率双 Tab |
| 8 | `stats` | 学习统计 | 时长录入 + 折线 + 明细 |
| 9 | `goal` | 目标管理 | 加权汇总 + 列表 + 编辑 |
| 10 | `ai` | AI 智能分析 | 提分建议（可落库）+ 单题讲解 |
| 11 | `admin` | 管理后台 | 8 KPI + 6 图表 + 用户列表（admin/mentor） |
| 12 | `me` | 我的 | 8 KPI + 账号设置 + 科目知识点 |

### 4.2 五态实现

统一由 `renderState(el, { loading, empty, emptyAction, html, error, errorAction })` 驱动：

| 状态 | 呈现 |
| --- | --- |
| **加载** | 3 条 `.apple-skeleton` 骨架屏（令牌层提供 shimmer，不用转圈） |
| **空** | `.state` 卡片：圆形图标 + 标题「暂无数据」+ 说明 + 行动按钮（如「生成 AI 计划」） |
| **错误** | `.state` 卡片 + 错误原文 + 「重试」按钮 |
| **无权限** | `admin` 视图对非 admin/mentor 账号显示「无权限」态（后端同时返回 403 兜底） |
| **404** | 未知 hash 路由 → 「页面不存在」态 + 返回首页 |

### 4.3 动效与降级

- 视图进入：`opacity 0→1` + `translateY(8px→0)`，`--dur-base`
- 候选面板：`viewIn` 快速淡入
- 卡片/按钮按下：`scale(0.97)`
- **`prefers-reduced-motion: reduce` 下全部降级**（令牌层 + 项目层双重 `@media`）
- **无任何无限循环装饰动画**（原 CRT 的光标闪动已删除）

---

## 五、图表配色（Chart.js → Apple 系统色）

原配色为荧光绿/青色硬编码。现改为**运行时读取 CSS 变量**，使图表随深浅色模式自动跟随：

```js
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function hexA(color, a) { /* #RRGGBB → rgba() */ }
function appleOptions(legend) { /* 网格/刻度用 --separator 与 --label-secondary */ }
```

| 图表 | 数据源 | 配色 |
| --- | --- | --- |
| 学习时长折线 | `/api/stats/14` | `--tint` 描边 + 12% 填充 |
| 模考总分趋势 | `/api/exams/trend` | `--tint` |
| 模考各科得分率 | `/api/exams/trend` | `--blue` |
| 科目正确率雷达 | `/api/admin/dashboard` | `--tint` |
| 时间块状态分布（环形） | `blocks_by_status` | `--tint` / `--orange` / `--green` / 灰 |
| 目标达成（柱） | `goal_target` | `--orange` |
| 用户注册分布（柱） | `exam_distribution` | `--purple` |
| 账号角色分布（环形） | `role_distribution` | `--tint` / `--blue` / `--red` |

图表字体统一 `-apple-system, ... PingFang SC`，图例用 `usePointStyle` 圆点。

---

## 六、依赖本地化（无构建步骤）

前端**不引入任何构建工具**，全部依赖落盘 `frontend/vendor/`：

```
vendor/
├── shoelace/      Web Components（autoloader 按需注册）+ themes/light.css + themes/dark.css
├── open-props/    normalize.min.css（基础重置）
└── chartjs/       chart.umd.min.js
```

### ⚠️ 踩坑记录（沿用上一版结论）

1. **必须用 `cdn/` 而非 `dist/`**：`dist/` 内含裸模块引用（`import ... from "lit"`），浏览器无法解析；
   `cdn/` 为预打包版本。误用会导致 125 个 `<sl-*>` 全部静默注册失败。
2. **autoloader 路径解析**：必须显式声明根路径
   `<script type="module" src="vendor/shoelace/shoelace.js" data-shoelace="/vendor/shoelace">`，
   否则动态 import 会拼成 `/vendor/shoelace/vendor/shoelace/components/...` → 404。
3. **tab-group 注册竞态**：`sl-tab-group` 可能先于 `sl-tab-panel` 升级，导致默认 `active` 丢失。
   解决：等组件就绪后强制重新同步 `active`，并 `dispatchEvent(new Event('resize'))` 让隐藏期初始化的图表重算尺寸。
4. **主题文件路径**：`themes/light.css` 与 `themes/dark.css` 是**独立文件**（不在 `shoelace.css` 内），
   需用 `<link media="(prefers-color-scheme: ...)">` 分别引入，否则深色模式下组件仍是浅色。
5. **`@import` 会被静态托管原样送出**：`css/style.css` 曾用 `@import url('apple-tokens.css')`，
   而 `index.html` 已经用 `<link>` 引入同一文件，导致令牌重复加载。已改为**只由 HTML 引入**。

---

## 七、Apple 基底自检清单

- [x] 字体族与字号阶梯完全按令牌层，无自创字号
- [x] 主题色只有一个（`--yellow`），其余颜色只用于语义
- [x] 卡片无边框、阴影极浅；毛玻璃只用在顶部导航（悬浮层）
- [x] 分隔线是 1px 发丝线，无粗边框
- [x] 深色模式可用（含 Shoelace 主题桥接），切换无闪烁
- [x] 圆角只用令牌层定义的档位
- [x] 动效有 `prefers-reduced-motion` 降级
- [x] 每页有加载 / 空 / 错误 / 无权限 / 404 五态
- [x] 无霓虹、扫描线、终端绿、硬投影、粗黑边（grep 零命中）
- [x] 与其它九套并排看：基底一致，但「时间块日历 + 命令行」一眼可辨

---

## 八、与其它项目的差异

| 项目 | 组件库 | 差异化维度 | 构建 |
| --- | --- | --- | --- |
| MindCare | Mantine 8 | 底部 Tab 栏 + 卡片流 | Vite |
| ScholarBoard | Naive UI | ⌘K 命令面板 + 三栏工作区 | Vite |
| EduPulse | Ant Design 6 | 可拖拽 Widget 驾驶舱 | Vite |
| HiveMarket | PrimeVue 4 | 瀑布流 + 详情抽屉 | Vite |
| **ExamPrep（本项目）** | **Shoelace 2 + Open Props** | **时间块日历 + 命令行** | **无构建** |

**一句话记忆点**：ExamPrep 是十套里唯一**没有构建步骤**的（改完源码刷新即可）、
唯一使用 **Web Components** 的，也是唯一把「计划」做成**可拖拽 30 分钟粒度日历**的。

---

## 九、运行

无构建步骤，直接启动后端即可（前端由 4105 端口托管）：

```bash
cd backend && node server.js
```

访问 http://localhost:4105/ · 演示账号 `demo / demo123`
