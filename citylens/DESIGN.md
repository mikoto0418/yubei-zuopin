# CityLens 前端设计文档

> 城市公共设施巡检与故障上报平台 · 地图空间形态（map）
> 技术栈：Vue 3 + Vite + vue-router v4 + Element Plus + Leaflet
> 后端端口 4202，前端开发端口 5202，`/api` 代理到后端

---

## 一、形态说明：为什么是"地图"

CityLens 的形态规格是 **map（地图空间形态）**，与其它四套（看板 / 对话流 / 编辑器 / 时间轴）并排看必须一眼可辨。
本系统的核心命题是「**空间**是主界面」——所以：

| 维度 | 本系统做法 |
| --- | --- |
| 布局 | **地图铺满全屏**（`position: fixed; inset: 0`），所有 UI 都是浮在地图之上的半透明面板 |
| 导航 | 没有传统侧边栏菜单。**标记点即导航**：点标记 → 右侧详情抽屉 |
| 主交互 | 点选标记 → 侧滑详情；筛选 → 标记显隐实时变化；搜索 → 地图飞至目标点 |
| 视觉 | 地图是主角，面板用 `backdrop-filter: blur()` 半透明毛玻璃 + 圆角阴影，克制用色 |

**与"通用后台"的关键区别**：不存在「左侧菜单 + 中间表格 + 弹窗表单」这个模板。
设施台账表格（`/facilities`）只是**辅助视图**，从地图顶栏的「列表视图」按钮进入，是空间视图的补充而非主体。
进入系统后第一眼（也是默认路由 `/` → `/map`）看到的是一张覆盖全屏的济南市地图，上面按状态着色的设施点位。

### 面板体系

```
┌───────────────────────────────────────────────────────┐
│ 顶部浮层：Logo │ 搜索框 │ 离线标记 · 定位 · 适配 · 列表 · 用户 │
├──────────┬────────────────────────────────┬───────────┤
│ 筛选面板  │                                │ 详情抽屉   │
│ (可收起)  │         Leaflet 地图主体        │ (点标记滑出)│
│ 类别/状态 │       （瓦片 或 离线网格底图）    │ 4 个标签页 │
│ 计数/统计 │                                │           │
└──────────┴────────────────────────────────┴───────────┘
```

---

## 二、地图实现

### 2.1 引擎封装（`src/mapEngine.js`）

Leaflet 的全部生命周期收在一个模块里，视图层只调用三个函数：

- `createMap(container)` —— 初始化地图、比例尺、缩放控件、标记图层组，并装配离线降级状态机。返回一个 state 对象（含 `map`、`markers`、`online`、`destroy`）。
- `makeMarkerIcon(facility, selected)` —— 用 `L.divIcon` 生成**水滴形标记**（`border-radius: 50% 50% 50% 4px` + `rotate(-45deg)`），背景色取自设施状态，内部是类别 emoji。选中态尺寸放大到 34px 并加高亮环。
- `renderMarkers(state, facilities, onSelect, selectedId)` —— 按当前筛选结果**全量重绘**标记，跳过无有效经纬度（`lat/lng` 为 0 或非数字）的点位。

之所以用 `divIcon` 而非图片图标：状态色是数据驱动的（绿/黄/红三色随 `status` 字段变化），图片图标需要预生成多套资源；DOM 图标可以直接从 CSS 变量取色，也省掉了 Leaflet 默认图标在打包器下的路径问题。

标记内容里所有用户输入（名称/地址/类别）都经过 `escapeHtml()` 转义后再拼进 popup 的 HTML。

### 2.2 状态着色与图例

| 状态 | 颜色 | 色值 |
| --- | --- | --- |
| 正常 | 绿 | `#22c55e` |
| 待检修 | 黄 | `#f59e0b` |
| 故障 | 红 | `#ef4444` |

配色集中在 `src/constants.js` 的 `STATUS_COLOR` / `STATUS_TAG`（Element Plus tag 类型），地图标记、筛选面板圆点、表格 tag、抽屉状态标签全部引用同一份常量，不存在第二处硬编码。

### 2.3 地图交互清单

- **点标记** → `selectFacility()`：选中态重绘 + `flyTo` 平滑飞至该点（zoom 至少 15）+ 右侧抽屉滑出
- **搜索定位**：顶部 `el-autocomplete` 按名称/地址匹配，选中或回车后飞至目标点并选中
- **定位到我的位置**：`navigator.geolocation`，失败/拒绝授权时给中文提示而不报错崩溃
- **适应全部可见设施**：`fitBounds` 到当前筛选结果的包围盒
- **列表页跳转**：`/facilities` 点「地图」→ `/map?focus=<id>`，地图加载完成后自动选中该设施
- **筛选改变标记显隐**：`watch(visible)` → `renderMarkers` 重绘

---

## 三、离线降级策略（重点）

这是本套形态的健壮性考点：**瓦片加载失败或断网时，地图不能白屏，标记必须仍然可用可点。**

### 3.1 网格底图

自定义 `GridFallbackLayer = L.GridLayer.extend({ createTile })`，`createTile` 直接 `document.createElement('div')` 返回一个带 CSS 网格线背景的瓦片（`.cl-grid-fallback`），并在瓦片角落标注 `z{z} · {x},{y}` 便于确认当前层级。
该图层**不发起任何网络请求**，所以离线时必然可用。

### 3.2 三条降级触发路径

| 触发条件 | 实现 |
| --- | --- |
| 启动时已知离线 | `navigator.onLine === false` → 直接挂网格图层，不发瓦片请求 |
| 瓦片持续报错 | 监听 `tileerror`，累计到阈值 3 次 → 降级 |
| 网络挂起（错误不触发） | 挂载瓦片图层时设 4.5s 超时，期间无任何 `tileload` 成功 → 降级 |

第三条是必要的兜底：某些网络环境下请求会一直 pending，`tileerror` 永远不会触发，只靠错误计数会一直停在全屏空白。

### 3.3 恢复路径

降级后并非永久放弃：

- `window.addEventListener('online')` → 立即尝试恢复瓦片图层
- 另有 20s 定时器乐观探测（仅在 `navigator.onLine !== false` 时），挂上瓦片图层试探，若再失败会自动回到网格（因为错误/超时逻辑仍然生效）

恢复成功时移除网格图层、去掉容器 `is-offline` 类、顶部「离线模式」标签消失，并 toast 提示「已恢复在线地图瓦片」。

### 3.4 降级期间的表现

- 地图容器加 `.is-offline`（换底色）
- 顶部栏出现橙色 `离线模式` 标签（`WarningFilled` 图标）
- attribution 变为「© OpenStreetMap contributors, 离线网格底图」
- **标记图层完全不受影响**——它挂在独立的 `L.layerGroup` 上，与底图图层互不干扰

### 3.5 实测证据

在浏览器中派发 `offline` 事件后：

```
before: { tiles: 24, grid: 0,  markers: 10 }   ← 在线 OSM 瓦片
after:  { grid: 24,  markers: 10, offlineTag: true }  ← 网格瓦片 + 离线标签
```

并且在网格底图状态下点击标记 `经十路 002 号路灯`，详情抽屉正常滑出，信息完整（类别/地址/状态/坐标/安装时间/备注/关联故障）。
24 个瓦片被同数量的网格瓦片替换，说明底图整层切换而非叠加。

---

## 四、组件库用法（Element Plus 真实落地）

组件库不是装饰，关键路径都由 Element Plus 承载：

| 组件 | 使用位置 |
| --- | --- |
| `el-table` + `el-table-column` | 设施台账列表（含 fixed 操作列、stripe、`show-overflow-tooltip`） |
| `el-pagination` | 台账分页（total/sizes/prev/pager/next，10/20/50 每页） |
| `el-form` + `el-form-item` + 校验 rules | 登录/注册、设施新增编辑、故障上报、AI 诊断 |
| `el-input` / `el-input`（textarea） | 各处文本输入，带 `maxlength` + `show-word-limit` |
| `el-select` / `el-option` | 类别、状态筛选 |
| `el-radio-group` + `el-radio-button` | 严重程度（轻微/一般/严重）、设施状态 |
| `el-date-picker` | 安装时间 |
| `el-autocomplete` | 顶部设施搜索（自定义 `#default` 插槽渲染类别图标 + 状态 tag） |
| `el-dialog` | AI 路线规划结果 |
| `el-drawer` 语义 | 右侧详情面板（自绘 `cl-drawer` 以获得滑出动画与半透明质感） |
| `el-tabs` / `el-tab-pane` | 详情抽屉四标签页 |
| `el-tag` | 状态、严重程度、故障状态、来源标注 |
| `el-alert` | 错误态回显 + 重试按钮、演示账号提示 |
| `el-empty` | 空态（无设施/无巡检记录/无故障/筛选无结果） |
| `el-skeleton` | 加载态（地图加载、列表加载、AI 生成中） |
| `el-result` | 403 / 404 页 |
| `el-dropdown` | 用户菜单（管理概览 / 退出登录） |
| `el-tooltip` | 顶栏圆形按钮说明 |
| `el-badge` | 筛选面板收起时的已选条件计数 |
| `el-progress` | 管理概览的类别分布占比 |
| `el-divider` / `el-row` / `el-col` | 布局 |
| `ElMessage` / `ElMessageBox` | 全局提示、删除二次确认 |
| `@element-plus/icons-vue` | 全量注册，模板中直接用 `<el-icon><Location /></el-icon>` 等形式 |

另有少量自绘样式（面板浮层、标记、时间线）作为形态语言，但交互控件与状态反馈一律走 Element Plus，符合"组件库决定观感"的要求。

---

## 五、与其它四套的差异

| 项目 | 形态 | 布局一眼可辨的特征 | 组件库 |
| --- | --- | --- | --- |
| flowboard | board | 顶部工具栏 + 横向泳道，拖拽卡片改状态 | shadcn/ui + Tailwind |
| **citylens（本套）** | **map** | **全屏地图 + 左右浮层，标记点即导航** | **Element Plus** |
| interviewgo | chat | 左侧会话列表 + 右侧对话流，气泡流式输出 | MUI |
| inkwell | editor | 文档树 + 中部编辑器 + 大纲面板，所见即所得 | Arco Design |
| chronicle | timeline | 中轴纵向时间轴，左右交错卡片 | Chakra UI |

**CityLens 的独有性**：

1. 唯一一套**首屏不是列表/表单**的系统——首屏是一张可缩放拖拽的地图。
2. 唯一一套把**地理坐标（lat/lng）当作一等数据**的系统；其它四套的主键是文本与时间。
3. 唯一一套需要处理**第三方瓦片服务不可达**的场景，并为此实现了完整的降级状态机。
4. 交互入口在**空间**上：用户通过"点哪里"而不是"点第几行"来选数据。
5. 浮层化布局（毛玻璃面板盖在地图上）与 flowboard 的实心工具栏、inkwell 的三栏实心布局形成鲜明对比。

---

## 六、页面清单

| 路由 | 组件 | 说明 |
| --- | --- | --- |
| `/login` | `views/LoginView.vue` | 登录 + 注册（同页切换）。左侧品牌介绍区 + 右侧表单，演示账号一键填入 |
| `/` | — | 重定向到 `/map` |
| `/map` | `views/MapHomeView.vue` | **主界面**。全屏地图 + 顶部搜索栏 + 左侧筛选面板（可收起）+ 右侧详情抽屉 + AI 路线规划对话框 |
| `/facilities` | `views/FacilitiesListView.vue` | 设施台账表格视图。搜索/类别/状态筛选、分页、新增/编辑/删除完整 CRUD |
| `/admin` | `views/AdminView.vue` | 管理概览（仅 admin）。4 张统计卡 + 类别分布进度条 + 用户列表 |
| `/403` | `views/ForbiddenView.vue` | 无权限访问（非 admin 访问 `/admin` 时路由守卫重定向到此） |
| `*` | `views/NotFoundView.vue` | 404 |

### 组件

| 文件 | 职责 |
| --- | --- |
| `components/FilterPanel.vue` | 左侧筛选面板：类别 chips（带计数）、状态复选行（带计数与色点）、显示结果统计、AI 规划路线入口、图例 |
| `components/FacilityDrawer.vue` | 右侧详情抽屉：设施信息 / 巡检历史时间线 / 上报故障表单 / AI 诊断，四个标签页 |

### 模块

| 文件 | 职责 |
| --- | --- |
| `api.js` | 请求封装：自动带 `Authorization: Bearer`、统一解包 `{code,data,message}`、401 清登录态并广播 `cl:unauthorized` 事件 |
| `auth.js` | 登录态 composable（全局单例 reactive state）：login / register / refresh / logout |
| `router.js` | 路由表 + 守卫（未登录跳登录、已登录访问登录页跳地图、非 admin 访问 admin 跳 403）+ 动态标题 |
| `constants.js` | 领域常量：类别、状态、配色、图标、严重程度、故障状态 |
| `mapEngine.js` | Leaflet 引擎与离线降级状态机 |
| `composables/useFacilities.js` | 设施数据 + 筛选条件的共享单例 store（地图页与列表页复用） |

---

## 七、状态处理（评审硬性要求）

- **加载态**：地图页浮层 spinner「正在加载设施点位…」；列表页 `el-skeleton`；抽屉历史记录 `el-skeleton`；AI 规划对话框 `el-skeleton` + 文案
- **空态**：
  - 全局无设施 → `el-empty` + 「去新增设施」按钮
  - 筛选后无结果 → 提示 + 「重置筛选」按钮（**与全局空态区分**，避免误导用户以为没数据）
  - 无巡检记录 → `el-empty` + 「上报一次故障」行动按钮
  - 无关联故障 / 无历史故障 → `el-empty`
- **错误态**：地图加载失败 → 浮层卡片显示后端 message + 「重试」；列表失败 → `el-alert` + 重试；抽屉历史失败 → `el-alert` + 重试；AI 失败 → 结果框内显示失败原因
- **表单校验**：前端 `el-form` rules（用户名长度、密码长度与一致性、必填项、经纬度数字校验）+ 后端 `message` 通过 `ElMessage.error` 回显
- **401**：`api.js` 统一拦截 → 清 token → 派发事件 → `App.vue` 监听并跳登录页
- **403**：路由守卫拦截非 admin 访问 `/admin` → 跳 `/403` 页

## 八、鉴权与存储

- `localStorage` 键：`cl_token`（JWT 字符串）、`cl_user`（用户 JSON）
- 提交实体时不带 `user_id` 与 `created_at`（由后端注入/数据库生成）
- 管理员查询列表时带 `all=1` 以查看全部用户的数据（后端按 `req.user.role === 'admin'` 放行）

## 九、构建

```bash
cd citylens/frontend
npm install
npm run build     # vite build，零错误
npm run dev       # 开发服务器 http://localhost:5202，/api 代理到 4202
```

实测构建输出：

```
✓ 1633 modules transformed.
dist/index.html                     0.42 kB │ gzip:   0.31 kB
dist/assets/index-*.css           383.83 kB │ gzip:  56.81 kB
dist/assets/MapHomeView-*.js      176.87 kB │ gzip:  53.16 kB
dist/assets/index-*.js          1,210.19 kB │ gzip: 388.79 kB
✓ built in 5.41s
```

后端会自动挂载 `frontend/dist` 作为静态资源，因此生产模式下前端与 API 同源，无需额外代理配置。

---

## 十、深化改造（第二批）

本节记录从「地图 + 设施台账」深化为「**地图 + 工单闭环 + 主数据体系**」的改造内容。

### 10.1 数据模型：4 张表 → 11 张表

保留 `users` / `facilities` / `inspections` / `faults`，新增 7 张：

| 表 | 作用 | 关键字段 |
| --- | --- | --- |
| `districts` | 行政区 / 网格 | `name` `code` `center_lat` `center_lng` |
| `facility_types` | 设施类型字典 | `name` `icon` `default_cycle_days` |
| `maintenance_teams` | 维修班组 | `leader` `phone` `specialties` `active_jobs` `capacity` `active` |
| `work_orders` | 工单主表 | `code` `fault_id` `facility_id` `team_id` `status` `priority` + 四个流转时间戳 |
| `work_order_logs` | 工单流转日志（时间轴数据源） | `order_id` `from_status` `to_status` `operator_id` `remark` |
| `inspection_routes` | 巡检路线 | `district_id` `facility_ids`（有序 JSON）`cycle` |
| `notifications` | 站内通知 | `user_id` `type` `title` `body` `read` |

`facilities` 补 `district_id` / `type_id` 外键，`faults` 补 `diagnosis` / `diagnosed_at`（AI 回写位），`inspections` 补 `route_id`（路线打卡溯源）。

### 10.2 工单状态机（后端强校验）

状态机定义集中在 `backend/src/workflow.js`，路由只负责鉴权与落库，**规则单一事实来源**：

```
created（待派单）
  → assigned（已派单）      ← 必须带 team_id
  → in_progress（维修中）
  → resolved（待验收）
  → verified（已验收）
  → closed（已关闭，终态）

resolved → in_progress      退回重做
```

- 非法流转（如 `created → closed`）返回 **400**，消息为中文可读提示，并列出当前状态允许的目标状态
- 每次流转在 **同一事务**内写入 `work_order_logs`，保证状态与时间轴永不脱节
- 派单 / 关闭时同步维护 `maintenance_teams.active_jobs`（在途产能），并在 `assigned / resolved / closed` 三个节点给上报人发站内通知

### 10.3 AI 闭环：诊断 → 落库 → 自动建单

这是本系统「AI 结果写入业务表并驱动后续流程」的核心，不是一次性文本：

```
POST /api/faults/:id/diagnose
  ├─ 组装故障 + 设施 + 区域上下文
  ├─ ai.generate()：配置了 LLM_API_KEY 走大模型，否则本地规则降级（响应带 source）
  └─ 单事务内：
       ├─ UPDATE faults SET diagnosis = ?, diagnosed_at = ?, status = '处理中'
       └─ INSERT work_orders (status='created', priority 由 severity 映射)
          + INSERT work_order_logs（备注写明 AI 来源）

返回 { diagnosis, source, fault, work_order, auto_created: true }
```

前端在工单详情抽屉里直接展示 `faults.diagnosis`（标注「AI 诊断结论（已落库）」），派单时再调 `POST /api/ai/dispatch` 按**专长匹配 0.65 + 空余产能 0.35** 打分推荐班组，并把推荐结果预选到派单下拉框，由人确认后才真正流转——保持「AI 建议 → 人工决策」的边界。

### 10.4 Apple 设计基底

前端从「深色科幻 + 霓虹蓝」整体切换到 Apple 设计语言：

| 项 | 改造前 | 改造后 |
| --- | --- | --- |
| 令牌来源 | 项目自定义 `--cl-*` 变量 | 共享 `apple-tokens.css`（`main.js` 中先于 `styles.css` 导入） |
| 主题色 | `#2563eb` 霓虹蓝 + 渐变徽标 | `--green #34C759`，`--tint` / `--tint-soft` 语义映射 |
| Element Plus | 默认视觉 | 覆盖 `--el-color-primary`、`--el-border-radius-base: 12px`、字体栈为 SF Pro / PingFang |
| 卡片 | 1px 边框 + 自定义阴影 | 去边框，`box-shadow: var(--shadow-card)`，圆角 `--radius-lg` |
| 表格 | 斑马纹 + 边框 | 去斑马纹，行间 1px `--separator` 发丝线 |
| 按钮 | 默认圆角 | `--radius-md`，主按钮实底，按下 `scale(0.97)` |
| 输入框 | 描边式 | 填充式 `--fill-secondary`，聚焦主题色 2px 描边 + 4px 柔光 |
| 登录页 | 深色径向渐变 + 网格线 | 白底分栏，左侧品牌介绍 + 右侧表单，克制用色 |
| 标记 | 硬投影 | `0 1px 4px rgba(0,0,0,0.25)`，选中态用 `--tint-soft` 光环 |

**保留的差异化维度**：全屏地图 + 毛玻璃浮层。`.cl-panel` 使用 `backdrop-filter: saturate(180%) blur(20px)`，只用于悬浮元素（顶栏 / 筛选面板 / 详情抽屉 / 地图状态卡），普通页面卡片用实底。

同时移除了全部霓虹、发光、深色科幻效果，并补齐 `prefers-reduced-motion` 降级与深色模式（`prefers-color-scheme`）。

### 10.5 五态完备

新增 `components/StateBlock.vue` 作为列表页统一状态容器，`composables/useAsync.js` 统一异步状态判定（把 403 映射为「无权限态」而非错误态）：

| 状态 | 表现 |
| --- | --- |
| 加载 | 骨架屏（`.apple-skeleton`），不用转圈 |
| 空态 | 图标 + 一句说明 + 一个行动按钮（按筛选/无数据给不同文案与按钮） |
| 错误 | 说明 + 重试按钮 |
| 无权限 | 独立图标与文案，引导返回地图 |
| 404 | 路由兜底页，显示访问路径 |

地图页的地图状态卡（加载 / 错误 / 空 / 筛选无结果）也按同一套语言重写。

### 10.6 页面清单（改造后）

| 路由 | 页面 | 关键能力 |
| --- | --- | --- |
| `/map` | 地图主页 | 全屏地图 + 毛玻璃浮层 + 顶栏直达其它模块 |
| `/facilities` | 设施台账 | 分页 / 搜索 / 类别·状态·区域筛选 + CRUD + 跳地图定位 |
| `/work-orders` | **工单管理** | 状态·区域·班组筛选 + 分页；详情抽屉含**状态流转时间轴**与**按当前状态渲染的可用操作**；AI 派单推荐 |
| `/districts` | **区域管理** | CRUD + 每区域设施数 / 工单数统计 |
| `/facility-types` | **设施类型管理** | CRUD（名称 / 图标 / 巡检周期） |
| `/routes` | **巡检路线** | 路线列表 + 详情（有序设施点 + 打卡 + 提交巡检记录） |
| `/teams` | **班组管理** | CRUD + 当前负载进度条（active_jobs / capacity） |
| `/admin` | 管理概览 | 8 项指标磁贴 + 工单六状态分布 + 区域统计 + 班组负载 + 类别分布 + 用户列表 |
| `/403` `/404` | 异常页 | 按 Apple 语言重写 |

新增的四个管理页共享 `components/AppShell.vue`（顶部导航 + 页面容器），导航项覆盖全部业务模块。

### 10.7 权限模型：共享资产 vs 归属资源

设施 / 巡检 / 故障是「全员共同维护的城市资产」，给内核 `crudRoutes` 增加了 `shared` 开关：

- `shared: true` → 读 / 改 / 删不做归属过滤（`user_id` 仍记录创建人），任意登录用户可见可改
- 默认 `shared: false` → 保留原有归属过滤语义，越权访问返回 403

主数据（区域 / 类型 / 班组 / 路线）用 `ownerColumn: null`，管理员界面才显示写操作入口；`admin/*` 仍由 `adminOnly` 中间件守卫，普通用户访问返回 403。

### 10.8 种子数据

幂等种子（已有工单数据即跳过；检测到旧版种子会先清理再重铺），时间跨度 2026-09-14 ~ 2026-09-23（≥ 7 天）：

| 实体 | 数量 |
| --- | --- |
| 用户 | 5（admin / inspector1 / inspector2 / team1 / team2） |
| 区域 | 5（历下 / 市中 / 槐荫 / 天桥 / 历城） |
| 设施类型 | 8 |
| 设施 | 30（均挂区域与类型） |
| 巡检记录 | 27 |
| 故障 | 15（9 条带 diagnosis） |
| 维修班组 | 5 |
| 工单 | 12（**六种状态各 2 条**） |
| 工单日志 | 42（按状态机链路推导，非手写） |
| 巡检路线 | 5（每条 6 个有序点位） |
| 通知 | 20 |

工单日志由 `CHAIN[status]` 顺序推导生成，保证时间轴与状态永远自洽；班组 `active_jobs` 在建单后按在途工单**重算**，不手写数字。

### 10.9 测试

| 套件 | 文件 | 用例数 | 覆盖 |
| --- | --- | --- | --- |
| 内核通用套件 | `test/core.test.js` | 9 | 注册 / 登录 / 鉴权 / 401 / 403 / 404 / 分页 |
| 领域深化套件 | `test/domain.test.js` | 32 | 状态机静态定义、合法全链路、6 类非法流转、派单校验、退回重做、日志写入、AI 降级与落库、自动建单、AI 派单匹配、越权、分页边界、主数据 CRUD、路线 JSON 解析 |

合计 **41 个用例全绿**（`node --test --test-concurrency=1`）。

### 10.10 端到端验证

在 4202 端口实测完整链路，**40 项断言全部通过**：

```
登录（admin / inspector1 / team1）
  → 上报故障
  → AI 诊断（source=local 降级，diagnosis 落库，工单总数 +1，自动建单 status=created）
  → AI 派单推荐（推荐到照明维修一班）
  → 非法流转 created→closed 返回 400；派单缺 team_id 返回 400
  → created→assigned→in_progress→resolved→verified→closed 全部 200
  → 日志 6 条、序列正确、含操作人与备注、四个时间戳齐全
  → 越权 403、page=0 规整、pageSize 上限 100、状态与区域筛选
  → overview 六状态分组 / 区域统计 / 班组负载、路线 facility_ids 解析、通知
  → 路线打卡写入巡检记录
```
