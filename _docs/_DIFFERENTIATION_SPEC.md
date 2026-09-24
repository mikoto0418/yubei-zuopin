# 五项目前端差异化改造规范

> 本文件是五个子代理共同遵守的施工规范。**硬约束违反即视为任务失败。**

---

## 0. 目标

五个项目当前共用同一套"手写 CSS + 少量自研组件"的前端做法，视觉上缺乏辨识度。
本次改造要让每个项目接入**不同的成熟组件库 + 不同的设计语言**，使五者在观感上一眼可辨，
同时**功能、接口、路由、登录态完全不变**。

用户已明确授权引入新依赖（含未在需求中点名的组件库）。

---

## 1. 全局硬约束（违反 = 任务失败）

### 1.1 绝对禁止
- ❌ 修改 `backend/` 目录下**任何**文件
- ❌ 修改任何 API 请求路径（`/api/...`）、请求方法、请求体字段名
- ❌ 修改任何前端路由路径（React Router 的 `path`、Vue Router 的 `path`、hash 路由的 key）
- ❌ 修改 `localStorage` / `sessionStorage` 的 **key 名称**（改了会导致登录态丢失）
- ❌ 删除或弱化任何已有功能（增删改查、分页、搜索、筛选、图表、语音、AI 调用等）
- ❌ 修改 `vite.config.js` 的 `server.port` 与 `proxy` 目标端口
- ❌ 提交 `.env`、密钥、真实 token

### 1.2 必须保留
- ✅ 所有页面必须仍然可达，且数据仍从真实 API 获取（不允许写死假数据）
- ✅ 登录 / 注册 / 退出 / 角色权限（user vs admin，403 拦截）行为不变
- ✅ 管理员仪表盘的所有图表必须保留，且数据来自真实接口
- ✅ 所有 AI 功能（对话、润色、计划生成、语音朗读/识别等）调用逻辑不变
- ✅ 构建必须通过：`npm run build` 零错误
- ✅ 源码 UTF-8（无 BOM），面向用户文案全中文

### 1.3 改造范围
允许且鼓励修改：
- `frontend/src/**` 下所有视图、组件、样式
- `frontend/index.html`
- `frontend/package.json`（新增依赖）
- 新增主题/设计令牌文件

---

## 2. 技术分配（一项目一库，不得重复）

| # | 项目 | 框架 | 指定组件库 | 图标库 | 视觉方向 |
|---|------|------|-----------|--------|---------|
| 1 | mindcare | React 18 | **Mantine 8** | @tabler/icons-react | 柔和治愈 · 呼吸感 |
| 2 | edupulse | React 18 | **Ant Design 6** | @ant-design/icons | 赛博霓虹数据驾驶舱 |
| 3 | scholarboard | Vue 3 | **Naive UI 2** | @vicons/ionicons5 | 编辑排版极简 · 纸感 |
| 4 | hivemarket | Vue 3 | **PrimeVue 4** | primeicons | 粗野主义电商 |
| 5 | examprep | 原生 HTML/JS | **Shoelace 2 + Open Props** | Bootstrap Icons（内联 SVG 亦可） | 复古终端 CRT |

> ⚠️ Mantine 必须用 **v8**（`@mantine/core@^8`），v9 要求 React 19，本项目是 React 18。

---

## 3. 分项目施工要求

### 3.1 mindcare — Mantine 8（柔和治愈）
- 安装：`@mantine/core@^8 @mantine/hooks@^8 @tabler/icons-react`
- 入口 `main.jsx` 引入 `@mantine/core/styles.css`
- 用 `MantineProvider` 包裹，配置 `theme`（主色用柔和紫 `#7c6cf0` 系、圆角 `radius: 'lg'`、字体）
- 必用组件：`AppShell`（侧边栏布局）、`Card`、`Button`、`TextInput/Textarea`、`Modal`、`Badge`、`Progress`（环形用 `RingProgress`）、`Timeline`、`SegmentedControl`、`Notification`（`@mantine/notifications` 可选）、`Loader`
- 保留 glassmorphism 的"柔光"气质，但改为 Mantine 组件承载；背景光斑可保留
- 冥想页保留呼吸动画与语音；测评页 SDS 20 题用 Mantine 表单/单选组件重做
- 图表（ECharts）保留，容器换成 Mantine `Card`

### 3.2 edupulse — Ant Design 6（赛博霓虹驾驶舱）
- 安装：`antd@^6 @ant-design/icons`
- 入口引入 `antd/dist/reset.css`
- 用 `ConfigProvider` + `theme={{ algorithm: theme.darkAlgorithm, token: {...} }}` 定制深色霓虹主题（青蓝/品红辉光）
- 必用组件：`Layout/Sider`、`Card`、`Statistic`、`Table`、`Form`、`Input`、`Button`、`Modal`、`Tag`、`Progress`、`Descriptions`、`message`
- **必须保留 `DigitalTeacher.jsx` 的 Canvas 数字人**（眨眼/瞳孔跟踪/说话动画），把它嵌进 antd 的卡片体系
- 题库练习、学习记录、笔记的表格/分页改用 antd `Table`
- 仪表盘 ECharts 保留，外层用 antd `Card` + `Statistic` 统计卡

### 3.3 scholarboard — Naive UI（编辑排版极简）
- 安装：`naive-ui @vicons/ionicons5`
- 用 `NConfigProvider` + `themeOverrides` 定制暖白纸感主题（墨黑 + 珊瑚橙 `#E85D04`）
- 必用组件：`NLayout/NLayoutSider`、`NCard`、`NDataTable`（笔记列表，服务端分页）、`NForm`、`NInput`、`NButton`、`NModal`/`NDrawer`、`NTag`、`NSelect`、`NDatePicker`、`NMessageProvider`、`NEmpty`
- 简历工作台用 `NDrawer` 做 AI 润色结果对比（原稿 / 润色稿并排）
- 任务看板用 `NCard` + `NTag` + 拖拽或分组列
- 大号衬线标题的编辑气质要保留，`NCard` 留白充足
- 仪表盘 ECharts 保留

### 3.4 hivemarket — PrimeVue 4（粗野主义电商）
- 安装：`primevue@^4 @primeuix/themes primeicons`
- `main.js` 配置 `PrimeVue` + 自定义 preset（在 Aura 基础上改 token：黑边框、硬阴影、红黑撞色）
- 必用组件：`DataTable`（后台/订单/商品列表）、`Card`、`Dialog`、`Button`、`InputText`、`Tag`、`Select`、`Paginator`、`Toast`、`ConfirmDialog`、`Badge`、`Avatar`
- 商品详情、发布、求购、订单、收藏、站内 IM 全部用 PrimeVue 组件重做外壳
- 保留粗野主义的 3px 黑边 + `5px 5px 0` 硬阴影 + 顶部滚动公告条
- 交易状态机（下单→确认→完成→取消）的 UI 要用 `Tag`/`Steps` 明确表达状态
- AI 智能上架、推荐保留

### 3.5 examprep — Shoelace + Open Props（复古终端 CRT）
- 该项目**无构建工具**，采用本地 vendor 方式引入（不要依赖 CDN 在线可用）
  - 通过 `npm pack` 或 curl 下载 `@shoelace-style/shoelace` 与 `open-props`，解出 dist 放到 `frontend/vendor/` 下
  - `index.html` 本地引用 `vendor/shoelace/shoelace.css`、`vendor/shoelace/shoelace.js`（autoloader）
  - 用 `<sl-*>` 自定义元素重做表单/对话框/标签页/按钮等
- 必用组件：`sl-card`、`sl-dialog`、`sl-input`、`sl-textarea`、`sl-select`、`sl-button`、`sl-tab-group`、`sl-badge`、`sl-progress-bar`、`sl-alert`、`sl-details`
- 保留 CRT 扫描线/眩光/光标闪动/等宽终端字体与方框字符边框
- **保留 `app.js` 的全部业务逻辑**：视图切换、登录、计划/目标/正确率/时长/AI/Admin 各模块的 API 调用一律不动，只替换渲染出的 DOM 结构与样式
- Admin 图表（Chart.js）保留

---

## 4. 施工方法（每个项目通用）

1. **先读后改**：先完整读一遍现有 `src/`，列出页面清单与 API 调用清单，确保不遗漏功能
2. **装依赖**：在 `frontend/` 下执行 `npm install <包> --save`（examprep 走 vendor）
3. **建设计令牌层**：新增一个 `theme.js` / `theme.css` 集中放颜色、圆角、阴影、字体，避免散落硬编码
4. **改造外壳**：先做布局（侧边栏/顶栏/导航），再做页面
5. **逐页改造**：每页改完自查功能是否仍可用
6. **构建验证**：`npm run build` 必须通过；失败必须修到通过
7. **写文档**：在项目根写 `DESIGN.md`，记录：用了什么库、视觉方向、组件映射、与其它四个项目的差异点

---

## 5. 交付物

每个项目必须产出：
- [ ] 改造后的 `frontend/` 源码
- [ ] 更新后的 `package.json`
- [ ] 项目根新增 `DESIGN.md`（中文）
- [ ] `npm run build` 成功的证据（贴出构建输出关键行）

---

## 6. 自检清单（提交前逐项确认）

- [ ] `npm run build` 通过，无错误
- [ ] 登录 → 进主页 → 各页面切换，功能正常
- [ ] API 路径未改动（对比备份 `_backup_frontends_*/<项目>/src`）
- [ ] 路由路径未改动
- [ ] localStorage key 未改动
- [ ] 管理员账号能进后台，图表有数据
- [ ] 无 `backend/` 改动
- [ ] 已写 `DESIGN.md`
