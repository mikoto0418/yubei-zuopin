# EduPulse 设计文档

> 设计基底：**Apple 设计语言**（统一规范见 `_pipeline/APPLE_DESIGN_SYSTEM.md`）
> 主题色：`--teal`（`#5AC8FA`）
> 差异化维度：**可拖拽 Widget 驾驶舱**（布局存 `localStorage`）
> 组件体系：**Ant Design 6** + `@ant-design/icons`

---

## 1. 技术栈

| 层 | 选型 | 版本 |
|---|---|---|
| 框架 | React | 18.3 |
| 构建 | Vite | 5.4 |
| 路由 | react-router-dom | 6.26 |
| 组件库 | antd | ^6（实装 6.6.5） |
| 图标 | @ant-design/icons | ^6 |
| 图表 | echarts | 5.5 |

无 CSS-in-JS、无原子化框架。视觉定制分两层：

1. **令牌层** `src/apple-tokens.css`（来自 `_pipeline/apple-tokens.css`，十套共用，**禁止在项目内重定义变量**）
2. **组件库层** `src/theme.js` → `ConfigProvider` 的 Design Token

---

## 2. 视觉方向

**Apple 设计语言**：浅色分组底色 + 白卡片 + 极克制阴影，界面像 iOS/macOS 原生 App。

| 维度 | 做法 |
|---|---|
| 底色 | `--bg-grouped` `#F2F2F7`；卡片 `--bg-surface` `#FFFFFF` |
| 主题色 | `--tint` → `var(--teal)` `#5AC8FA`，仅此一个主题色 |
| 语义色 | 成功 `--green` / 警告 `--orange` / 错误 `--red` / 信息 `--blue`，仅用于状态 |
| 卡片 | 无边框，`border-radius: 16px`，阴影 `0 1px 3px rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.04)` |
| 毛玻璃 | **仅悬浮层**（顶栏、拖拽手柄）：`saturate(180%) blur(20px)` + `rgba(255,255,255,.72)` |
| 分隔线 | 1px 发丝线 `--separator`，仅用于列表项之间，不用外框描边 |
| 圆角 | 只用 8 / 12 / 16 / 22 / 999 五档 |
| 字体 | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", …` |
| 字号 | 严格按 HIG 阶梯：34/22/17/15/13/12，不自创字号 |

**已彻底删除**：深色底 `#0a0718`、青紫发光、扫描网格、`text-shadow` 霓虹晕、渐变光条、呼吸状态灯、硬投影。全库检索 `neon|cyber|NEON|CYBER|#22d3ee|#a855f7|#8b5cf6` 已无残留（`DigitalTeacher.jsx` 的 Canvas 配色已换成 Apple 系统色）。

### 深色模式

- 令牌层 `apple-tokens.css` 用 `prefers-color-scheme` 切换全部 CSS 变量
- `theme.js` 导出 `buildAppleTheme(dark)`，`main.jsx` 用 `matchMedia` 监听系统主题并同步 antd 算法（`defaultAlgorithm` / `darkAlgorithm`）
- `index.html` 内联首屏底色 + `<meta name="color-scheme">`，**切换无白闪**
- 深色下额外覆盖半透明反馈底色（`styles.css` 末尾），保证对比度

---

## 3. 差异化维度：可拖拽 Widget 驾驶舱

统一基底之上，EduPulse **只在「首页布局可自定义」这一个维度**做区别，其余全部遵守基底。

- **布局**：CSS Grid `repeat(12, minmax(0,1fr))`，widget 用 `span-3/4/6/8/12` 声明列宽
  - ≤1200px：3/4 列降为 6 列
  - ≤720px：全部单列铺满
- **拖拽**：HTML5 原生 DnD（`draggable` + `dragstart/dragover/drop/dragend`），**零新增依赖**
- **编辑态**：默认锁定；点「编辑布局」后 widget 出现 1.5px 虚线描边与拖拽手柄（毛玻璃胶囊）；拖起半透明、目标位置 `--tint` 实线高亮
- **持久化**：`localStorage` key = `edupulse_dashboard_layout`（仅存 widget id 有序数组）
  - 读取容错：过滤已不存在的 widget、补齐新增 widget、解析失败回退默认
- **恢复默认**：网格底部按钮
- 与登录态 key `edupulse_token` 互不影响

> 只保留一个装饰性虚线描边（编辑态提示），符合基底「禁止无限循环装饰动画」的要求。

---

## 4. 页面与路由

| 页面 | 路由 | 说明 |
|---|---|---|
| **Home** 数据总览 | `/` | 可拖拽 Widget 网格：4 张统计卡 + **AI 洞察** + 各科时长 + 薄弱知识点 + 进行中目标 + 最近答题 + 学习节奏 + 快捷入口 |
| **Knowledge** 知识点掌握度 | `/knowledge` | 学科聚合条形图 + 薄弱点雷达 + 知识点明细（按正确率升序，可跳转专项练习）；总览/明细双视图 |
| **Practice** 题库练习 | `/practice` | 抽题设置 → 卡片翻页式作答；支持 `?knowledge_point_id=xx` 直接进入专项练习 |
| **WrongBook** 错题本 | `/wrong` | 待攻克/已掌握/全部三态筛选；就地重做、标记掌握、移除 |
| **Goals** 学习目标 | `/goals` | 周/月目标（时长/题量/正确率），进度条实时；状态机流转 |
| **Insights** AI 洞察 | `/insights` | AI 分析 → 落库展示 → 一键跳转知识点练习；状态可流转 |
| **Achievements** 成就墙 | `/achievements` | 12 枚徽章，未解锁显示进度；分类筛选 |
| **Notes** 学习笔记 | `/notes` | 表格 + 分页 + 搜索筛选；AI 知识梳理结果面板 |
| **StudyLog** 学习记录 | `/study` | 汇总统计 + 录入表单 + 记录列表 |
| **Teacher** AI 数字教师 | `/teacher` | 全屏对话（与右下角悬浮舱共用内核） |
| **Profile** 个人中心 | `/profile` | 学习画像、各科时长、知识点掌握度 |
| **Dashboard** 管理仪表盘 | `/dashboard` | 仅管理员；6 张概览卡 + 4 张 ECharts + 活跃度排行 |
| 403 / 404 | — | `Result` + 返回首页 |

### 五态完整性

每页覆盖：**加载**（骨架屏，不用转圈）· **空**（说明 + 行动按钮）· **错误**（说明 + 重试）· **无权限**（403 页）· **404**。

---

## 5. 保留项

### 5.1 Canvas 数字人（`components/DigitalTeacher.jsx`）

动画逻辑（眨眼周期、瞳孔鼠标跟踪、说话嘴部张合、思考态信号扩散、呼吸圈）**一行未改**；
仅把配色从霓虹紫青换成 Apple 系统色（`#5AC8FA` / `#007AFF`，深色描边 `#0055B3`），并去掉 Canvas `shadowBlur` 辉光。
外层容器为 `TeacherDock`（右下角 88px 毛玻璃白底浮舱）/ `TeacherPanel`（全屏对话）。

### 5.2 ECharts 图表

`components/EChart.jsx` 导出 Apple 调色板 `PALETTE` 与 `baseTooltip()` / `baseAxis()` / `masteryColor()`：

- 配色改为 Apple 系统色（blue/green/orange/purple/pink/teal/indigo/yellow）
- **去掉全部 `shadowBlur` 辉光**，饼图描边改白色 2px
- tooltip 改白底 + 极浅阴影 + 10px 圆角
- 坐标轴/分割线改用 `rgba(60,60,67,*)` 中性阶

### 5.3 Markdown 渲染器

`components/Markdown.jsx` 未改动（含 XSS 转义与链接协议白名单）。样式在 `styles.css` 的 `.markdown` 段，配色压到 Apple 基底。

---

## 6. 与其它九套的差异点

十套统一 Apple 基底，各用**一个系统色 + 一个独有交互范式**区分：

| 项目 | 主题色 | 差异化维度 |
|---|---|---|
| **EduPulse** | **`--teal`** | **可拖拽 Widget 驾驶舱（首页布局自定义，存 localStorage）** |
| MindCare | `--pink` | 底部 Tab 栏 + 卡片流 |
| ScholarBoard | `--orange` | ⌘K 命令面板 + 三栏工作区 |
| HiveMarket | `--red` | 瀑布流 + 详情抽屉 + 浮层聊天 |
| ExamPrep | `--yellow` | 时间块日历视图 |
| KitchenFlow | `--orange` | 高密度卡片 + 倒计时进度环 |
| CityLens | `--green` | 全屏地图 + 毛玻璃浮层 |
| InterviewGo | `--purple` | 对话流 + 气泡节奏 |
| ScriptForge | `--indigo` | 纸张质感 + 衬线正文 |
| LogiTrack | `--blue` | 中轴时间轴 + 地图联动 |

**EduPulse 的辨识锚点**：并排看基底完全一致，但一眼能认出——因为**只有它的首页卡片可以拖着重排**。

---

## 7. 构建

```bash
cd edupulse/frontend
npm install
npm run build
```

构建结果：

```
✓ 3718 modules transformed.
dist/index.html                0.84 kB │ gzip:   0.52 kB
dist/assets/index-*.css       34.17 kB │ gzip:   7.46 kB
dist/assets/index-*.js     2,357.88 kB │ gzip: 768.96 kB
✓ built in 17.66s
```

零错误通过。`index-*.js` 体积偏大源于 antd 全量引入 + ECharts，可用 `manualChunks` 按需拆包（不影响功能）。

---

## 8. 单端口部署

`backend/app.py` 托管前端产物，4103 端口直接服务整站：

| 路由 | 行为 |
|---|---|
| `GET /` | 有 `frontend/dist/index.html` 返回页面，否则回退 JSON 健康信息 |
| `GET /<path>` | 命中 dist 真实文件直出；否则交回 `index.html`（SPA 深链可达） |
| `GET /api/*`（未匹配） | 保持 JSON 404，不把接口错误伪装成页面 |

开发模式仍可用 Vite 5173 + proxy → 4103。

---

## 9. 本次改造自检清单

对照 `APPLE_DESIGN_SYSTEM.md` §5：

- [x] 字体族与字号阶梯完全按规范，无自创字号
- [x] 主题色只有一个（`--teal`），取自系统色
- [x] 卡片无边框、阴影极浅；毛玻璃只用在悬浮层（顶栏 / 拖拽手柄 / 浮舱）
- [x] 分隔线是 1px 发丝线，无粗边框
- [x] 深色模式可用，`matchMedia` + 内联底色，切换无闪烁
- [x] 圆角只用定义档位（8/12/16/22/999）
- [x] 动效有 `prefers-reduced-motion` 降级
- [x] 每页有加载 / 空 / 错误 / 无权限 / 404 五态
- [x] 无霓虹、扫描线、终端绿、硬投影、粗黑边
- [x] 与其它九套并排看：基底一致，但一眼能认出（可拖拽驾驶舱）
