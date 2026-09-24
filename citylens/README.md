# CityLens · 城市公共设施巡检与故障上报平台

> 形态：**地图空间形态（map）** —— 全屏地图即主界面，标记点即导航。

---

## 一、项目简介

CityLens 面向市政设施运维场景，把「路灯、垃圾箱、监控杆、消防栓、公交站牌、井盖、排水口」等城市公共设施统一纳入一张空间地图，解决三个问题：

1. **设施台账散落在表格里，看不出空间分布** —— 设施以带经纬度的一等数据存在于地图上，按状态着色，一眼看清哪片区域故障集中。
2. **巡检与故障上报是纸面流程，无法回溯** —— 每次巡检形成一条时间线记录，每条故障形成工单（含严重程度与处理状态），与设施绑定。
3. **现场处置缺少决策支持** —— 内置 AI 故障诊断与 AI 巡检路线规划，配置大模型时走真实推理，未配置时自动降级为本地规则引擎，离线也能演示。

**一句话记忆点**：首屏不是列表也不是表单，而是一张铺满全屏的济南市地图，上面是绿/黄/红三色着色的设施点位；点标记，右侧滑出详情抽屉。

---

## 二、核心功能

### 地图主体

- **全屏 Leaflet 地图**：容器 `position: fixed; inset: 0`，所有 UI 以半透明毛玻璃浮层（`backdrop-filter: blur()` + 圆角阴影）悬浮在地图之上。没有传统侧边栏菜单。
- **标记按状态着色**：用 `L.divIcon` 生成水滴形标记（`border-radius: 50% 50% 50% 4px` + `rotate(-45deg)`），背景色取自设施状态，内部为类别 emoji；选中态尺寸放大到 34px 并加高亮环。

  | 状态 | 颜色 | 色值 |
  | --- | --- | --- |
  | 正常 | 绿 | `#22c55e` |
  | 待检修 | 黄 | `#f59e0b` |
  | 故障 | 红 | `#ef4444` |

  配色集中在 `frontend/src/constants.js` 的 `STATUS_COLOR` / `STATUS_TAG`，地图标记、筛选面板圆点、表格 tag、抽屉状态标签全部引用同一份常量。

- **点标记滑出详情抽屉（4 个标签页）**：点选标记 → 地图 `flyTo` 平滑飞至该点（zoom 至少 15）+ 右侧抽屉滑出。抽屉四个标签页为：**设施信息 / 巡检历史时间线 / 上报故障表单 / AI 诊断**。
- **筛选面板**：左侧可收起面板。类别 chips（带计数）、状态复选行（带计数与色点）、显示结果统计、AI 规划路线入口、图例。筛选变化实时驱动标记显隐（`watch(visible)` → `renderMarkers` 全量重绘）。
- **搜索定位**：顶部 `el-autocomplete` 按名称/地址匹配，选中或回车后飞至目标点并选中该设施。
- 另有「定位到我的位置」（`navigator.geolocation`，失败时给中文提示）与「适应全部可见设施」（`fitBounds` 到当前筛选结果包围盒）。

### 业务模块

- **设施台账 CRUD**：`/facilities` 列表视图，从地图顶栏「列表视图」进入，是空间视图的辅助补充。支持搜索 / 类别 / 状态筛选、分页（10/20/50）、新增/编辑/删除。字段：名称、类别、地址、经纬度、状态、安装时间、备注。
- **巡检记录**：针对某设施登记巡检结果（正常/异常）、巡检人、备注与时间；在详情抽屉中以时间线呈现。
- **故障上报**：针对某设施上报故障工单，含标题、描述、严重程度（轻微/一般/严重）、处理状态（待处理/处理中/已解决）、上报人。
- **AI 故障诊断**：`POST /api/ai/diagnose`。输入故障描述与严重程度，输出可能原因、所需工具、预计工时、临时处置与派工建议。
- **AI 巡检路线规划**：`POST /api/ai/plan-route`。输入待检设施清单，按地理位置就近原则输出巡检顺序与预计耗时（结果以 `el-dialog` 呈现）。

### 离线地图降级（重点）

瓦片加载失败或断网时地图不白屏，**标记仍完全可用可点**。网格底图由 `GridFallbackLayer = L.GridLayer.extend({ createTile })` 实现，直接 `document.createElement('div')` 返回带 CSS 网格线的瓦片，并在角落标注 `z{z} · {x},{y}`，**不发起任何网络请求**。

三条降级触发路径：

| 触发条件 | 实现 |
| --- | --- |
| 启动时已知离线 | `navigator.onLine === false` → 直接挂网格图层，不发瓦片请求 |
| 瓦片持续报错 | 监听 `tileerror`，累计到阈值 3 次 → 降级 |
| 网络挂起（错误不触发） | 挂载瓦片图层时设 4.5s 超时，期间无任何 `tileload` 成功 → 降级 |

第三条是必要兜底：某些网络环境下请求会一直 pending，`tileerror` 永不触发。降级后并非永久放弃 —— 监听 `window online` 事件立即尝试恢复，另有 20s 定时器乐观探测。降级期间地图容器加 `.is-offline`，顶部栏出现橙色「离线模式」标签，attribution 变为「© OpenStreetMap contributors, 离线网格底图」；**标记图层挂在独立的 `L.layerGroup` 上，与底图图层互不干扰**。

---

## 三、技术栈

**前端**

| 依赖 | 版本 | 用途 |
| --- | --- | --- |
| vue | ^3.5.13 | 视图层 |
| vue-router | ^4.5.0 | 路由与守卫 |
| element-plus | ^2.8.8 | 组件库（表格/表单/抽屉/标签页等） |
| @element-plus/icons-vue | ^2.3.1 | 图标（全量注册） |
| leaflet | ^1.9.4 | 地图引擎 |
| vite | ^6.0.7 | 构建工具（`@vitejs/plugin-vue` ^5.2.1） |

**后端**

| 依赖 | 版本 | 用途 |
| --- | --- | --- |
| express | ^4.19.2 | HTTP 服务 |
| better-sqlite3 | ^11.3.0 | 嵌入式数据库 |
| jsonwebtoken | ^9.0.2 | JWT 鉴权 |
| bcryptjs | ^2.4.3 | 密码哈希 |
| cors | ^2.8.5 | 跨域 |
| dotenv | ^16.4.5 | 环境变量 |

后端会自动挂载 `frontend/dist` 作为静态资源，因此生产模式下前端与 API 同源，无需额外代理配置。

---

## 四、目录结构

```
citylens/
├── DESIGN.md                    前端设计文档（形态说明、地图实现、降级策略）
├── README.md                    本文件
├── start.sh                     一键启动（单端口生产模式）
├── start.bat                    Windows 启动脚本
├── verify.sh                    验证脚本：后端测试 → 前端构建 → 接口冒烟
│
├── backend/
│   ├── server.js                HTTP 服务入口
│   ├── db.js                    建表 + 索引 + 幂等种子数据
│   ├── kernel.js                内核聚合导出（db / auth / server / crud / admin 路由）
│   ├── routes.js                路由装配（实体 CRUD + AI 路由）
│   ├── overview.js              管理概览统计
│   ├── seed.js                  独立种子脚本（npm run seed）
│   ├── ai/
│   │   ├── diagnose.js          AI 故障诊断
│   │   └── plan-route.js        AI 巡检路线规划
│   ├── src/
│   │   ├── ai.js                 AI 统一入口（大模型 + 本地降级）
│   │   ├── auth.js               JWT 与密码哈希
│   │   ├── crud.js               通用实体 CRUD 路由工厂
│   │   ├── admin.js              管理端路由
│   │   ├── db.js                 数据库封装
│   │   ├── http.js               统一响应封装
│   │   ├── server.js             createApp 工厂
│   │   └── routes/               内核路由
│   ├── test/
│   │   ├── core.test.js          内核测试套件（10 项）
│   │   └── app.test.js           复用内核套件，替换装配函数
│   └── data/
│       └── citylens.db           SQLite 数据库文件
│
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.js
        ├── App.vue               根组件（监听 401 事件跳登录）
        ├── router.js             路由表 + 守卫 + 动态标题
        ├── api.js                请求封装（自动带 Bearer、统一解包、401 广播）
        ├── auth.js               登录态 composable（全局单例）
        ├── constants.js          领域常量（类别/状态/配色/图标/严重程度）
        ├── mapEngine.js          Leaflet 引擎 + 离线降级状态机
        ├── styles.css
        ├── components/
        │   ├── FilterPanel.vue   左侧筛选面板
        │   └── FacilityDrawer.vue 右侧详情抽屉（4 标签页）
        ├── composables/
        │   └── useFacilities.js  设施数据 + 筛选条件共享 store
        └── views/
            ├── LoginView.vue         登录 + 注册（同页切换）
            ├── MapHomeView.vue       主界面：全屏地图
            ├── FacilitiesListView.vue 设施台账表格视图
            ├── AdminView.vue         管理概览（仅 admin）
            ├── ForbiddenView.vue     403
            └── NotFoundView.vue      404
```

### 路由清单

| 路由 | 组件 | 说明 |
| --- | --- | --- |
| `/login` | `LoginView.vue` | 登录 + 注册（同页切换），演示账号一键填入 |
| `/` | — | 重定向到 `/map` |
| `/map` | `MapHomeView.vue` | 主界面 |
| `/facilities` | `FacilitiesListView.vue` | 设施台账 |
| `/admin` | `AdminView.vue` | 管理概览（仅 admin） |
| `/403` | `ForbiddenView.vue` | 无权限 |
| `*` | `NotFoundView.vue` | 404 |

---

## 五、快速开始

### 一键启动（推荐）

```bash
bash start.sh
```

脚本按顺序执行四步：安装后端依赖 → 安装前端依赖 → 构建前端产物 → 初始化数据并启动后端。启动后访问：

```
http://localhost:4202
```

> Windows 环境也可执行 `start.bat`。

### 手动分步启动

```bash
# 1. 后端
cd backend
npm install
cp ../.env.example ../.env    # 按需修改
npm run seed                  # 初始化演示数据（幂等）
npm start                     # 监听 4202

# 2. 前端（开发模式，另开终端）
cd frontend
npm install
npm run dev                   # http://localhost:5202，/api 代理到 4202
```

生产模式下后端会自动挂载 `frontend/dist`，前后端同源，无需代理。

---

## 六、演示账号

种子数据在 `backend/db.js` 的 `seedIfNeeded()` 中创建，共 **3 个账号**（幂等：已有用户则跳过）：

| 用户名 | 密码 | 角色 | 昵称 | 所属 |
| --- | --- | --- | --- | --- |
| `admin` | `admin123` | admin | 管理员 | 市城管局 |
| `inspector1` | `inspector123` | user | 王巡检 | — |
| `inspector2` | `inspector123` | user | 李巡检 | — |

> 仅 `admin` 可访问 `/admin` 管理概览；非 admin 访问会被路由守卫重定向到 `/403`。
> 登录页提供演示账号一键填入。

种子同时创建 **10 条设施**（围绕济南市中心分布，含真实经纬度）、**6 条巡检记录**、**4 条故障工单**。

---

## 七、测试

```bash
cd backend && npm test
```

基于 Node 内置测试运行器（`node --test`），共 **10 项**，全部覆盖核心链路：

```
✔ 注册成功返回 token 与用户
✔ 重复用户名注册被拒绝
✔ 弱密码被拒绝
✔ 未登录访问受保护接口返回 401
✔ 错误密码登录返回 401
✔ 正确凭证登录成功
✔ 普通用户访问 Admin 接口返回 403
✔ 管理员可访问 Admin 接口
✔ API 404 返回 JSON 而非 HTML
✔ test\core.test.js
ℹ tests 10  ℹ pass 10  ℹ fail 0
```

完整验证（后端测试 + 前端构建 + 接口冒烟）：

```bash
bash verify.sh
```

---

## 八、AI 配置

AI 能力通过三个环境变量开启，**未配置 `LLM_API_KEY` 时自动降级为本地规则引擎**，功能不中断、离线可演示。

```bash
LLM_API_KEY=sk-xxxxxxxx
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

- 接口为 **OpenAI 兼容**的 `POST {LLM_BASE_URL}/chat/completions`，可对接任何兼容端点。
- 调用超时由 `LLM_TIMEOUT` 控制（默认 20000 ms）。
- 响应体始终带 `source` 字段（`llm` / `local`），前端据此标注引擎来源。
- 大模型调用失败（网络异常、返回为空、超时）会自动降级并打印告警，不会向前端抛错。

---

## 九、配置项

`.env.example` 逐项说明：

| 变量 | 示例值 | 说明 |
| --- | --- | --- |
| `SECRET_KEY` | `change-me-to-a-random-string` | 通用密钥，请改为随机字符串 |
| `JWT_SECRET` | `change-me-too` | JWT 签名密钥。**未配置时进程启动会生成随机密钥，重启后登录态失效** |
| `PORT` | `4202` | 后端监听端口 |
| `LLM_API_KEY` | （留空） | 大模型 API Key。**留空则 AI 走本地规则降级** |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI 兼容端点地址 |
| `LLM_MODEL` | `gpt-4o-mini` | 使用的模型名 |

可选变量（代码中读取但未列入示例）：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `LLM_TIMEOUT` | `20000` | 大模型调用超时（毫秒） |
| `DB_PATH` | `backend/data/citylens.db` | SQLite 数据库文件路径 |

使用方式：

```bash
cp .env.example .env
# 编辑 .env 后启动
```

---

## 十、设计文档

前端的形态说明、地图引擎封装细节、离线降级状态机、Element Plus 组件落点、状态处理（加载态/空态/错误态/401/403）、构建产物实测数据，详见：

- **[DESIGN.md](./DESIGN.md)**

---

## 十一、截图

> 占位，待补充实际运行截图。

| 位置 | 说明 | 截图 |
| --- | --- | --- |
| 登录页 | 左侧品牌介绍 + 右侧表单，演示账号一键填入 | _待补充_ |
| 地图主界面 | 全屏地图 + 顶部搜索栏 + 左侧筛选面板 + 右侧详情抽屉 | _待补充_ |
| 详情抽屉 · 设施信息 | 类别 / 地址 / 状态 / 坐标 / 安装时间 / 备注 | _待补充_ |
| 详情抽屉 · 巡检历史 | 时间线形式的巡检记录 | _待补充_ |
| AI 巡检路线规划 | 按就近原则输出的顺序与预计耗时 | _待补充_ |
| 离线网格底图 | 断网后的网格瓦片 + 橙色「离线模式」标签，标记仍可点选 | _待补充_ |
| 设施台账列表 | 表格 + 分页 + 完整 CRUD | _待补充_ |
| 管理概览（admin） | 4 张统计卡 + 类别分布进度条 + 用户列表 | _待补充_ |

---
## 十二、深化改造（第二批）

第二批把 CityLens 从「地图 + 设施台账」深化为「**地图 + 工单闭环 + 主数据体系**」。

### 新增能力

- **工单系统（六状态状态机）**：`created → assigned → in_progress → resolved → verified → closed`，含 `resolved → in_progress` 退回重做。非法流转由后端强校验并返回 400，每次流转写 `work_order_logs`，详情页展示完整时间轴。
- **AI 闭环**：故障诊断结果写入 `faults.diagnosis` 并**在同一事务内自动创建工单**（`status=created`）；AI 智能派单按「专长匹配 + 空余产能」推荐班组并预选到派单下拉框。
- **主数据体系**：区域（行政区 / 网格）、设施类型字典（含图标与巡检周期）、维修班组（含负载产能）、巡检路线（有序设施点 + 打卡）。
- **站内通知**：工单派单 / 待验收 / 关闭时自动通知上报人。
- **Apple 设计基底**：全站切换 Apple 设计语言（SF Pro / PingFang 字体栈、系统绿主题色 `#34C759`、发丝线分隔、极浅阴影、克制圆角），保留「全屏地图 + 毛玻璃浮层」这一差异化维度；移除全部霓虹 / 发光 / 深色科幻效果；补齐深色模式与 `prefers-reduced-motion` 降级。

### 数据模型（11 张表）

```
users  districts  facility_types  facilities  inspections  faults
work_orders  work_order_logs  maintenance_teams  inspection_routes  notifications
```

其中 `facilities` 补 `district_id` / `type_id` 外键，`faults` 补 `diagnosis` / `diagnosed_at`（AI 回写位），`inspections` 补 `route_id`（路线打卡溯源）。

### 页面

| 路由 | 页面 |
| --- | --- |
| `/map` | 地图主页（全屏地图 + 毛玻璃浮层，顶栏直达各模块） |
| `/facilities` | 设施台账（分页 / 搜索 / 类别·状态·区域筛选 + CRUD） |
| `/work-orders` | **工单管理**（状态·区域·班组筛选 + 详情抽屉状态流转时间轴 + AI 派单） |
| `/districts` | **区域管理**（CRUD + 设施数 / 工单数统计） |
| `/facility-types` | **设施类型管理**（CRUD：名称 / 图标 / 巡检周期） |
| `/routes` | **巡检路线**（路线列表 + 详情有序点位 + 打卡提交） |
| `/teams` | **班组管理**（CRUD + 负载进度条） |
| `/admin` | 管理概览（8 项指标磁贴 + 工单六状态分布 + 区域 / 班组 / 类别统计） |
| `/403` `/404` | 异常页（按 Apple 语言重写） |

每个页面都具备**加载骨架 / 空态 / 错误重试 / 无权限 / 404** 五态。

### 演示账号

| 用户名 | 密码 | 角色 |
| --- | --- | --- |
| `admin` | `admin123` | 管理员（可访问管理概览，全部读写） |
| `inspector1` | `inspector123` | 巡检员 |
| `inspector2` | `inspector123` | 巡检员 |
| `team1` | `team123` | 维修班组 |
| `team2` | `team123` | 维修班组 |

### 种子数据

5 区域 · 8 设施类型 · 30 设施 · 27 巡检 · 15 故障（9 条带 AI 诊断）· 5 班组 · 12 工单（六状态各 2 条）· 42 条工单日志 · 5 条巡检路线 · 20 条通知，时间跨度 ≥ 7 天。

### 测试与验证

- 后端单元测试：**41 个用例全绿**（内核通用套件 9 + 领域深化套件 32），覆盖状态机合法 / 非法流转、越权 403、分页边界、AI 降级 `source=local`、日志写入验证。
- 端到端实测：**40 项断言全部通过**（登录 → 上报故障 → AI 诊断自动建单 → 派单 → 六状态全链路 → 日志校验 → 越权 / 分页 / 筛选 → 打卡落库）。
- 前端构建：`npm run build` 零错误。

详见 **[DESIGN.md](./DESIGN.md)** 第十章。
