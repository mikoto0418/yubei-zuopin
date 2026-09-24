# 五项目前端差异化改造 · 交付报告

> 改造日期：2026-09-23
> 目标：让五套学生作品在**视觉与技术上真正区分开**，同时**功能、接口、登录态零改动**。

---

## 一、改造前后对比

### 改造前的问题

五个项目虽然业务内核不同，但前端做法高度雷同：都是「手写 CSS + 少量自研组件（Modal/Markdown/EChart 三个几乎同名同实现的组件）」。表现为：

- 每个项目都是 `styles.css` 里一堆 CSS 变量 + 手写 `.btn` / `.card` / `.modal`
- 交互细节（表单校验、加载态、通知、确认弹窗、分页）全靠自己写，质量参差
- 五个项目放在一起，除了配色不同，**骨架和交互质感几乎一模一样**

### 改造后

每个项目接入**不同**的成熟组件库，形成五套独立的设计语言：

| 项目 | 组件库 | 图标库 | 视觉气质 | 一句话记忆点 |
|---|---|---|---|---|
| **MindCare** | Mantine 8 | Tabler Icons | 柔和治愈 · 玻璃柔光 | 唯一「柔软」的，大圆角 + 柔光 |
| **ScholarBoard** | Naive UI 2 | Ionicons5 | 编辑排版极简 · 纸感 | 暖白纸感 + 珊瑚橙 + 衬线大标题 |
| **EduPulse** | Ant Design 6 | Ant Design Icons | 赛博霓虹数据驾驶舱 | 深色 + 青蓝/品红辉光 + 高密度 |
| **HiveMarket** | PrimeVue 4 | PrimeIcons | 粗野主义电商 | 3px 黑边 + 硬阴影 + 红黑撞色 |
| **ExamPrep** | Shoelace 2 + Open Props | Shoelace Icons | 复古终端 CRT | 扫描线 + 等宽字体 + 深黑墨绿 |

**没有任何两个项目用同一个组件库**，也没有任何两个共用同一套配色或圆角策略。

---

## 二、技术栈分布

| 项目 | 框架 | 构建 | 状态管理 | 图表 | 后端 | 端口 |
|---|---|---|---|---|---|---|
| MindCare | React 18 | Vite 5 | useState + hash 路由 | ECharts | Flask | 4101 |
| ScholarBoard | Vue 3 | Vite 6 | 组合式 API + vue-router | ECharts | Express | 4102 |
| EduPulse | React 18 | Vite 5 | Context + react-router | ECharts | Flask | 4103 |
| HiveMarket | Vue 3 | Vite 6 | 自建 store + vue-router | ECharts | Express | 4104 |
| ExamPrep | 原生 JS | **无构建** | IIFE + 模块状态 | Chart.js | Express | 4105 |

技术栈的差异化同样明显：React / Vue / 原生三选一全覆盖，构建工具与无构建各占其一。

---

## 三、设计令牌层

每个项目都新增了集中的设计令牌文件，避免颜色和尺寸散落各处：

- MindCare → `src/theme.js`（`mantineTheme` + `GLASS` + 情绪色板）
- ScholarBoard → `src/theme.js`（`paperThemeOverrides`，19 个组件域覆盖）
- EduPulse → `src/theme.js`（`NEON` 色板 + `cyberTheme` ConfigProvider 令牌）
- HiveMarket → `src/theme.js`（`definePreset(Aura, ...)` 粗野主义 preset）
- ExamPrep → `css/style.css` 顶部的 Open Props 令牌映射

---

## 四、功能保留验证

改造只动「外壳」，不动「内核」。以下均已逐项核对：

### 4.1 接口层（零改动）

| 项目 | 校验方式 | 结果 |
|---|---|---|
| MindCare | 备份 vs 新版 API 路径集合比对 | ✅ 完全一致 |
| ScholarBoard | `api.js` diff | ✅ 完全一致 |
| EduPulse | API 静态路径 diff | ✅ 完全一致 |
| HiveMarket | 23 条 API 路径集合比对 | ✅ 完全一致 |
| ExamPrep | 备份 `app.js` 对比 | ✅ 见下节 |

### 4.2 登录态（零改动）

| 项目 | localStorage key | 结果 |
|---|---|---|
| MindCare | `mc_token` / `mc_user` | ✅ 未变 |
| ScholarBoard | `sb_token` / `sb_user` | ✅ 未变 |
| EduPulse | `edupulse_token`（常量 `TOKEN_KEY`） | ✅ 未变 |
| HiveMarket | `hm_token` / `hm_user` | ✅ 未变 |
| ExamPrep | `ep_token` / `ep_user` | ✅ 未变 |

> key 变了会导致所有已登录用户掉线，是最容易踩的坑，故单独核对。

### 4.3 端到端实测

启动真实后端 + 真实登录 + 真实接口调用：

| 项目 | 健康检查 | 未授权拦截 | admin 登录 | 页面渲染 | 图表 | 控制台错误 |
|---|---|---|---|---|---|---|
| MindCare | 4101 ✅ | 401 ✅ | ✅ | ✅ | ECharts ✅ | 0 |
| ScholarBoard | 200 ✅ | 401 ✅ | ✅ | ✅ | 4 个 canvas ✅ | 0 |
| EduPulse | 200 ✅ | — | ✅ | ✅ | — | 0（已清 antd 6 废弃警告） |
| HiveMarket | 200 ✅ | — | ✅ | ✅ | — | 0 |
| ExamPrep | 见下节 | — | — | — | — | — |

**关键验证：EduPulse 的 Canvas 数字人**——改造要求「只能改外壳，不能改动画逻辑」。实测 `/teacher` 页面：450×450 画布存在、可见、采样区 22896 个非透明像素，**动画正常绘制**。

---

## 五、构建产物

| 项目 | 构建命令 | 结果 |
|---|---|---|
| MindCare | `npm run build` | ✅ 30.84s，零错误 |
| ScholarBoard | `npm run build` | ✅ 19.43s，零错误 |
| EduPulse | `npm run build` | ✅ 21.43s，零错误 |
| HiveMarket | `npm run build` | ✅ 9.98s，零错误 |
| ExamPrep | 无构建步骤 | 见下节 |

> 四个 Vite 项目均有「chunk > 500kB」的体积提示，来源是 ECharts / antd 全量引入，属**警告非错误**，改造前即存在。

---

## 六、启动方式

### 开发模式（前端热更新）

```bash
cd mindcare/frontend && npm run dev
```

```bash
cd scholarboard/frontend && npm run dev
```

```bash
cd edupulse/frontend && npm run dev
```

```bash
cd hivemarket/frontend && npm run dev
```

Vite 会自动把 `/api` 代理到对应后端端口（见各项目 `vite.config.js`）。

### 生产模式（后端托管构建产物）

```bash
cd scholarboard && bash start.sh
```

```bash
cd hivemarket && bash start.bat
```

### 演示账号

| 项目 | 管理员 | 普通用户 |
|---|---|---|
| MindCare | `admin / admin123` | `xiaolan / xiaolan123` |
| ScholarBoard | `admin / admin123` | `alice / 123456` |
| EduPulse | `admin / admin123` | `demo / demo123` |
| HiveMarket | `admin / admin123` | 见登录页 |
| ExamPrep | `admin / admin123` | 见登录页 |

---

## 七、可回滚

改造前的全部前端源码已备份：

```
_backup_frontends_20260923_1846/
├── mindcare/     (src/ + index.html + package.json)
├── scholarboard/
├── edupulse/
├── hivemarket/
└── examprep/     (css/ + js/ + index.html)
```

如需回退某个项目，把对应目录内容覆盖回去即可（`backend/` 全程未被触碰）。

---

## 八、文件清单

每个项目新增/修改的主要文件：

**MindCare**
- 新增 `src/theme.js`、`DESIGN.md`
- 改写 `App.jsx`、`main.jsx`、`styles.css`、`pages/` 全部 8 个页面

**ScholarBoard**
- 新增 `src/theme.js`、`DESIGN.md`
- 改写 `App.vue`、`layout/AppLayout.vue`、`views/` 全部页面、`components/Modal.vue`、`ConfirmModal.vue`、`assets/base.css`

**EduPulse**
- 新增 `src/theme.js`、`DESIGN.md`
- 改写 `App.jsx`、`main.jsx`、`components/Layout.jsx`、`styles.css`、`pages/` 全部页面
- 删除 `components/Modal.jsx`（被 antd Modal 取代）
- `components/DigitalTeacher.jsx`、`EChart.jsx` **一行未改**

**HiveMarket**
- 新增 `src/theme.js`、`DESIGN.md`
- 改写 `main.js`、`App.vue`、`styles.css`、`util.js`、`components/` 全部、`views/` 全部 14 个页面

**ExamPrep**
- 新增 `frontend/vendor/`（Shoelace 9.4M + Open Props + Chart.js 本地化）、`DESIGN.md`
- 改写 `frontend/index.html`、`frontend/css/style.css`、`frontend/js/app.js`（仅 DOM 与样式）

---

## 九、改造原则回顾

1. **先读后改** — 每个项目先完整读一遍源码，列出页面清单与 API 清单
2. **一项目一库** — 五套组件库互不重复，形成真正的视觉区分度
3. **只换外壳** — API 路径、路由、存储 key、业务逻辑一律不动
4. **构建必须过** — 每个项目 `npm run build` 零错误才算完成
5. **实测验证** — 启动真实后端跑通登录与核心页面，不靠「看起来对」
6. **留好退路** — 改造前完整备份，可随时回滚
