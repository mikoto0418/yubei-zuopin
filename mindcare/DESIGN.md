# MindCare · 前端设计文档

> 本文档记录 MindCare 前端在"五项目差异化改造"中的设计决策，用于说明它与另外四个项目为何一眼可辨。

---

## 一、组件库选型

| 项 | 选择 |
| --- | --- |
| 框架 | React 18 + Vite 5 |
| **组件库** | **Mantine 8**（`@mantine/core@^8` + `@mantine/hooks@^8`） |
| 通知 | `@mantine/notifications@^8` |
| 图标 | `@tabler/icons-react` |
| 图表 | ECharts（沿用，仅换容器） |

**为什么是 Mantine**：五个项目中另一个 React 项目（EduPulse）用的是 Ant Design。Mantine 与 antd 的设计哲学截然不同——antd 强调企业级规整与信息密度，Mantine 强调圆润、留白与柔和的层次感，正好匹配 MindCare「心理陪护」的治愈定位。

> ⚠️ 版本注意：Mantine v9 要求 React 19，本项目是 React 18，因此锁定在 **v8**。

---

## 二、视觉方向：柔和治愈 · 呼吸感

改造前的 MindCare 是「毛玻璃拟态 + 紫色渐变光斑」，这个基调被完整保留，但承载它的骨架从手写 `div` + CSS 换成了 Mantine 组件。

| 维度 | 取值 |
| --- | --- |
| 主色 | 柔和紫 `#7c6cf0`（`theme.primaryColor = "mindcare"`） |
| 辅色 | 樱花粉 `#f3a7c9`（`blush` 色板） |
| 默认圆角 | `lg`（Mantine 主题级设定，全站统一） |
| 字体 | PingFang SC / Microsoft YaHei |
| 阴影 | 紫色调柔光 `0 10px 34px rgba(124,108,240,.13)` |
| 背景 | 渐变 + 两枚模糊光斑（保留原设计） |

情绪三态语义色：积极 `#4ade80`、中性 `#94a3b8`、消极 `#f87171`。

---

## 三、设计令牌层

`src/theme.js` 是**唯一**的视觉令牌来源，避免颜色/圆角散落在各页面：

- `BRAND` / `BRAND_SOFT` — 主色与辅色
- `PALETTE` / `SWATCHES` / `SEGMENT_COLORS` — 情绪色板与图表色序
- `GLASS` — 玻璃拟态的 background / blur / border / shadow
- `mantineTheme` — 注入 `MantineProvider` 的主题对象（含 `mindcare`、`blush` 两组自定义色阶）
- `KIND` — 情绪分类与后端 `kind` 字段的映射

---

## 四、形态改造（第二批次）

> 第一批完成后，五套项目被指出"共性过强"：全部是左侧边栏 + 卡片网格 + 弹窗表单 + 后台式 Admin。
> 第二批的目标是让**布局范式与主交互**彼此不同。MindCare 被指定为「沉浸式卡片流」。

### 4.1 改了什么

| 维度 | 改造前（后台形态） | 改造后（App 形态） |
| --- | --- | --- |
| **导航** | 左侧 236px 竖排 `AppShell.Navbar`，含 Logo、菜单、用户信息块 | **底部居中悬浮胶囊导航**（毛玻璃 + 图标 + 文字），悬浮头像移到右上角 |
| **首页** | 3 列统计卡 + 折线图 + 洞察卡，网格排布 | **纵向滚动卡片流**，6 张卡片高低错落，滚动视差淡入 |
| **冥想页** | 卡片内嵌 `RingProgress` + 呼吸球，导航常驻 | **全屏沉浸模式**，隐藏全部导航，只剩呼吸圆环 + 计时 + 引导语，ESC 退出 |
| **情绪日记** | 2×2 `SimpleGrid`，历史记录用 `Table` | **时间轴式卡片**（竖线 + 彩点 + 悬浮卡片），标签管理与情绪分布折叠收纳 |
| **AI 陪护** | 固定高度卡片，输入框在卡内 | 全高对话区 + **吸底悬浮输入条**（贴在胶囊导航之上） |
| **内容宽度** | `max-width: 1180px`（后台宽屏） | `max-width: 760px` 单列居中（手机屏幕宽度） |
| **评测/后台** | 多列网格 | 收敛为单列卡片流（Admin 的 ECharts 网格保持多列，因为驾驶舱本就该密） |

### 4.2 新布局范式

**一列窄栏 + 底部悬浮胶囊。** 整个应用被约束在 760px 的中央单列里，像一块手机屏幕被摆在桌面中央；所有导航收进底部一枚毛玻璃胶囊，所有内容以卡片为单位纵向堆叠。

- `.mc-stage` — 760px 中央舞台容器
- `.mc-dock` — 底部悬浮胶囊导航（`position: fixed` + `backdrop-filter`）
- `.mc-flow` — 纵向卡片流容器（`flex column` + `gap: 16px`）
- `.mc-reveal` — IntersectionObserver 驱动的视差淡入容器

### 4.3 三种卡片高度节奏

卡片流不是等高的网格，而是刻意做出高低差以形成"滚动节奏"：

| 类名 | 用途 | 高度 |
| --- | --- | --- |
| `.mc-card-hero` | 今日心情（首页首卡）、冥想时长选择 | `min-height: 250px` |
| `.mc-card-tall` | 冥想推荐 | `min-height: 208px` |
| 默认 | 其余卡片 | 由内容决定 |

每张卡片进入视口时触发淡入 + 上移归位（`--rv-y` 变量控制位移幅度 14–34px），卡片之间错开 40–60ms 的 `transition-delay`，形成层次感而非整屏同时出现。

### 4.4 全屏沉浸冥想

冥想页由两种形态构成，由 `running` 状态切换：

- **准备态**：普通卡片流（选择时长 → 开始）
- **沉浸态**：`position: fixed; inset: 0` 的全屏深紫渐层，中央是 268px 的呼吸圆环（保留原 `breathe` 动画，放大到 176px 并加 halo 光晕），下方是 56px 的等宽计时与滚动引导语

进入沉浸态时，App 层通过 `onImmersive` 回调给 `.mc-stage` 加上 `is-immersive`，底部胶囊导航与右上角悬浮头像同时淡出；`keydown` 监听 ESC 退出。

### 4.5 与改造前的对比

| | 改造前 | 改造后 |
| --- | --- | --- |
| 第一眼印象 | 后台管理系统 | 手机 App |
| 导航位置 | 左侧竖排 | 底部悬浮胶囊 |
| 内容组织 | 网格 / 表格 | 纵向卡片流 / 时间轴 |
| 视觉重心 | 左上角 Logo | 屏幕中央的内容卡 |
| 滚动体验 | 静态 | 视差淡入 |

**一句话记忆点**：五个项目里，MindCare 是唯一一个**看起来像 App 而不是像后台**的——别人用侧边栏和网格，它用底部胶囊和卡片流。

---

## 五、组件映射表

| 原实现 | 现实现 |
| --- | --- |
| `.shell` + `.sidebar` + `.nav-btn` 手写侧边栏 | 底部悬浮胶囊 `.mc-dock`（原生 `button` + Mantine `Avatar` / `Menu`） |
| `.glass` 卡片 | `Card` + 全局 `GLASS` 令牌 |
| 自研 `Modal.jsx` | Mantine `Modal` |
| 手写按钮 | `Button`（含 `variant` / `size` 分级） |
| 原生 `input` / `textarea` | `TextInput` / `PasswordInput` / `Textarea` |
| 手写标签 | `Badge` |
| 情绪评分进度 | `RingProgress` + `Progress` |
| 情绪历史表格 | 自研时间轴 `.mc-timeline` + `.mc-tl-card` |
| 视图切换按钮组 | `SegmentedControl` |
| 折叠收纳 | Mantine `Collapse` |
| 加载态 | `Loader` |
| `alert()` 提示 | `notifications`（`@mantine/notifications`） |
| 图标 emoji | `@tabler/icons-react`（保留部分 emoji 作情绪语义） |
| 滚动淡入 | 自研 `components/Reveal.jsx`（IntersectionObserver） |

---

## 六、功能保留清单

以下逻辑**一行未改**，只替换了外层 DOM：

- **冥想页**：呼吸动画（`requestAnimationFrame` / CSS keyframes）、语音合成引导（`speechSynthesis`）与 22 秒循环朗读节奏
- **AI 陪护页**：对话调用、回复朗读（`speechSynthesis`）、离线回退提示
- **心理测评**：SDS 20 题完整流程、反向计分与标准分换算、自定义问卷创建/作答
- **管理后台**：ECharts 四张图表与风险名单，数据来自真实 `/api` 接口
- **登录态**：`localStorage` 的 `mc_token` / `mc_user` 未变（已与备份逐字节比对）
- **路由**：hash 路由 key（`dashboard` / `mood` / `assessment` / `meditation` / `chat` / `admin`）未变
- **API**：所有请求路径与方法未变（`diff` 备份 `src/api/client.js` 结果：`API IDENTICAL`）
- **组件库**：仍是 Mantine 8

---

## 七、与其它四个项目的差异

| 项目 | 组件库 | 视觉气质 | 关键区分点 |
| --- | --- | --- | --- |
| **MindCare（本项目）** | **Mantine 8** | **柔和治愈 · 玻璃柔光** | **底部胶囊导航 + 纵向卡片流 + 全屏沉浸冥想** |
| ScholarBoard | Naive UI | 编辑排版极简 | 暖白纸感 + 珊瑚橙 + 衬线大标题 + 圆角为 0 |
| EduPulse | Ant Design 6 | 赛博霓虹驾驶舱 | 深色 + 青蓝/品红辉光 + 高信息密度 |
| HiveMarket | PrimeVue 4 | 粗野主义电商 | 3px 黑边 + 硬阴影 + 红黑撞色 |
| ExamPrep | Shoelace 2 | 复古终端 CRT | 扫描线 + 等宽字体 + 深黑墨绿 |

**一句话记忆点**：MindCare 是五个里唯一「柔软」的——别人用直角和硬边，它用大圆角和柔光；也是唯一像 App 的。

> ⚠️ 上面第二~七章记录的是**Apple 改造之前**的设计（柔和紫 + 毛玻璃光斑）。这一版已被第八章的 Apple 基底取代，保留作为改造前后对照。当前视觉以第八章为准。

---

## 八、Apple 改造（第三批次 · 当前生效）

### 8.1 为什么改

第二批的「毛玻璃拟态 + 紫色渐变光斑」单看有个性，但放在十套系统里像另一个年代的产品：光斑让页面偏暗，渐变文字在投影仪上发虚，紫色与其它 App 的高饱和色撞在一起没有统一感。

第三批次把十套前端收敛到**同一套 Apple 设计语言基底**，差异化不再靠配色，而是靠**每套独有的交互范式 + 一个克制的主题色**。MindCare 保留它最像 iOS App 的「底部 Tab 栏 + 卡片流」，其余全部压到 Apple 规范之下。

### 8.2 令牌层

新增 `src/apple-tokens.css`（与 `_pipeline/apple-tokens.css` 同源），在 `main.jsx` 中**最先 import**，末尾追加主题色覆盖：

```css
:root { --tint: var(--pink); --tint-soft: rgba(255, 45, 85, 0.12); }
```

| 项 | 取值 |
| --- | --- |
| 主题色 | Apple System Pink `#FF2D55`（= `--pink`） |
| 字体栈 | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", …` |
| 大标题 | 34px / 700 / 1.2，字距 -0.02em |
| 正文 | 17px / 400 / 1.5 |
| 圆角 | 只用 8 / 12 / 16 / 22 / 999 五档 |
| 阴影 | 只留两档：`--shadow-card`（卡片）、`--shadow-float`（悬浮层） |
| 背景 | `--bg-grouped` `#F2F2F7` 浅灰分组底 |
| 卡片 | `--bg-surface` `#FFFFFF`，**无边框**，极浅阴影 |

`src/theme.js` 重写为 Apple 令牌的 JS 侧映射：`BRAND = #FF2D55`、Apple 系统色色板、`SHADOW` 两档、Mantine 主题的 `fontFamily` 用 Apple 栈、`defaultRadius: 'lg'`、`shadows` 只留两档。同时新增 `APPT_STATUS` / `ALERT_LEVEL` / `ALERT_STATUS` / `ALERT_ACTION` 四组业务状态元数据，供预约与预警页面复用。

### 8.3 删掉了什么

| 删除项 | 原因 |
| --- | --- |
| `.blob` 两枚紫色渐变光斑 | 违反「禁止霓虹/高饱和装饰」 |
| `linear-gradient(135deg, --accent, --accent2)` 渐变按钮/徽章/头像 | 改为主题色实底 |
| `.mc-bignum` 的渐变文字 | 改为 `color: var(--tint)` 实心数字 |
| `.mc-glass` 的 `backdrop-filter` + 白色半透明 + 紫色阴影 | 改为白底 + 无边框 + `--shadow-card` |
| 卡片 `withBorder`（24 处） | Apple 规范：卡片无边框 |
| 硬编码紫色 `#7c6cf0` / `#f3a7c9` / `#8a87a3`（约 60 处） | 全部替换为 `#FF2D55` / `#FF6482` / `#8E8E93` |

**毛玻璃只保留在两处悬浮层**：底部 Tab 栏 `.mc-dock`、AI 对话输入条 `.mc-chat-composer`。这是规范允许的用法。

### 8.4 保留的差异化维度

**底部 Tab 栏 + 卡片流** —— 这是 MindCare 在十套里最容易被认出的地方，完整保留：

- `.mc-dock` 悬浮胶囊导航，主题色实底高亮当前项，`max-width: calc(100vw - 32px)` + 横向滚动（新增页面后 Tab 变多，窄屏不挤爆）
- `.mc-flow` 纵向卡片流，卡片间距 16px
- 全屏沉浸冥想 `.mc-immersive` 保留（深色是语义需要，不是装饰霓虹）

Tab 栏按角色动态追加：核心 5 项（首页/心情/测评/冥想/陪护）+ 咨询师/预约/资源/周报 4 项；`counselor` 与 `admin` 追加「预警」，`admin` 再追加「后台」。

### 8.5 五态组件

新增 `src/components/States.jsx`，全站统一复用：

| 组件 | 用途 |
| --- | --- |
| `PageLoading` | 骨架屏（`apple-skeleton` 微光动画，不用转圈） |
| `EmptyState` | 空态：插图 + 一句说明 + 一个行动按钮 |
| `ErrorState` | 错误态：说明 + 重试按钮 |
| `ForbiddenState` | 无权限态（403） |
| `NotFoundState` | 404 |

`styles.css` 补齐配套的 `.mc-state` / `.mc-skeleton-card` / `.mc-steps`（预约状态时间轴）/ `.mc-list`（Apple 分组列表）等类。

### 8.6 深色模式

`apple-tokens.css` 用 `@media (prefers-color-scheme: dark)` 自动切换：背景 `#0D0D0F` / 卡片 `#1C1C1E` / 分组底 `#0D0D0F`，文字与分隔线随之反转。ECharts 的坐标轴颜色改用 `var(--label-secondary)`，图表跟着主题走。`MantineProvider` 设 `defaultColorScheme="auto"`，无闪烁。

### 8.7 新增页面

| 页面 | 路由 | 说明 |
| --- | --- | --- |
| 咨询师 | `#/counselors` | 列表（分页/搜索/擅长领域筛选）+ 预约弹窗（选时段、已约时段置灰） |
| 我的预约 | `#/appointments` | 状态时间轴 + 状态流转按钮（按角色显示）+ 完成评价 |
| 危机预警 | `#/crisis` | 仅 `counselor`/`admin` 可见；统计卡 + 状态/等级筛选 + 处理弹窗（联系/转介/解除） |
| 资源库 | `#/resources` | 全部文章 / 我的收藏 / 我的周报三个 Tab；分类筛选 + 搜索 + 收藏 + 阅读进度 |
| AI 周报 | `#/weekly` | 生成周报 → 落库 resources → 展示；首页也有入口卡片 |

首页 `Dashboard` 相应扩了两张卡：**情绪周报**（读取 `weekly_report`，展示标题与摘要）与 **待进行的预约**（读取 `upcoming_appointments`）。若存在未处理预警，顶部出现一张关切提示卡（不暴露预警细节，只引导预约）。

### 8.8 自检对照

- [x] 字体族与字号阶梯完全按规范，无自创字号
- [x] 主题色只有一个（`--pink`），其余为语义色
- [x] 卡片无边框、阴影极浅；毛玻璃只在 Tab 栏与输入条
- [x] 分隔线 1px 发丝线
- [x] 深色模式可用
- [x] 圆角只用规范档位
- [x] 动效有 `prefers-reduced-motion` 降级
- [x] 每页有加载 / 空 / 错误 / 无权限 / 404 五态
- [x] 无霓虹、扫描线、终端绿、硬投影、粗黑边

---

## 九、构建

```bash
npm install
npm run build
```

构建结果：`✓ built in 19.57s`，零错误（仅有 chunk > 500kB 的体积提示，来自 ECharts + Mantine 全量样式，非错误）。

---

## 十、单端口部署（前端产物由后端托管）

MindCare 后端在 `app.py` 中新增了静态托管，使 `npm run build` 产物可由 4101 端口直接服务，无需另起 Vite：

| 路由 | 行为 |
| --- | --- |
| `GET /` | 有 `frontend/dist/index.html` 就返回页面，否则回退 JSON 健康信息 |
| `GET /<path>` | 命中 dist 真实文件则直出；否则交回 `index.html`（SPA 深链可达） |
| `GET /api/*`（未匹配） | 保持 JSON 404，不把接口错误伪装成页面 |

- 前端 `dist` 路径：`mindcare/frontend/dist`（相对 `backend/app.py`）
- 开发模式仍可用 Vite 5173 + proxy → 4101，两种方式并存
- 验证：`bash _pipeline/smoke-frontend.sh mindcare` → 首页 HTML 200、引用资源 200、`/dashboard` 深链 200
- 后端测试在改动后仍全绿
