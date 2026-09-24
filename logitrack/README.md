# LogiTrack · 物流运单跟踪平台

从揽收到签收的全链路运单跟踪与异常处理平台。核心交互是**中轴时间轴与地图的双向联动**——点时间轴节点地图飞过去，点地图标记时间轴滚过去并高亮。

| 项 | 值 |
|---|---|
| 端口 | 4205（单端口托管前后端） |
| 后端 | Express 4 + better-sqlite3 + JWT |
| 前端 | React 18 + Vite 5 + Chakra UI v3 + Leaflet |
| 数据表 | 12 张 |
| 后端测试 | 59 个用例，全绿 |
| 演示账号 | `admin/admin123`、`dispatcher1/dispatcher123`、`courier1/courier123` |

---

## 一、快速开始

```bash
# Linux / macOS
bash start.sh

# Windows
start.bat
```

脚本流程：装后端依赖 → 装前端依赖 → 构建前端 → 初始化数据 → 启动服务。
打开 http://localhost:4205 即可。

**开发模式**（前端热更新，端口 5205 代理到 4205）：
```bash
cd backend && npm run seed && npm start      # 终端 1
cd frontend && npm run dev                    # 终端 2，访问 http://localhost:5205
```

**验证**：
```bash
bash verify.sh    # 后端测试 → 前端构建 → 接口冒烟
```

---

## 二、功能模块

### 2.1 运单查询首页
大搜索框（运单号 / 手机号 / 收件人姓名，300ms 防抖）+ 状态快捷筛选 + 日期范围 + 结果概览统计卡。列表卡片显示运单号、状态胶囊、起终点、收件人、货物、重量、运费、进度条。

### 2.2 运单详情（核心页）
左右双栏：**左侧中轴时间轴**（节点按状态着色，运输中节点带流动虚线动画），**右侧 Leaflet 地图**（路线折线 + 水滴标记）。两栏双向联动。

页面还包含：状态推进按钮组（只显示状态机允许的流转）、AI 时效预测入口、运单信息（寄收件人 / 货物 / 网点 / 司机车辆）、包裹明细。

### 2.3 运单创建
寄件人 + 收件人 + 路由与货物（网点 / 类型 / 重量 / 体积 / 付款方式 / 保价开关）+ 包裹明细（可增删多件）。**实时预估运费**，与后端计算规则一致。寄件人可从历史客户档案一键带入。

### 2.4 调度台（dispatcher / admin）
左侧待分配运单池（**可多选批量指派**），右侧司机卡片（显示车辆、评分、完单数、在途数）。每个司机卡片有「规划路线」按钮，调 AI 输出当日最优派送顺序。页面顶部还有「AI 滞留识别」入口。

### 2.5 异常件处理
异常列表（按状态 / 类型 / 关键词筛选）+ 统计卡（总数 / 待处理 / 已解决 / 分类型计数）。处理方式五种：**改址重投 / 原路退回 / 理赔结案 / 重新派送 / 仅关闭**，其中「原路退回」会联动运单状态机把运单变为 `returned`。

### 2.6 网点管理
网点 CRUD + 覆盖范围 + 经纬度 + 日容量 + 负责人。页面顶部有全网吞吐排行（按经过该网点的中转节点数排序）。

### 2.7 车辆司机
分段控件切换司机 / 车辆两个视图。司机卡片展开显示**当前在途任务列表**（可点进运单详情）；车辆卡片显示载重、容积、里程、下次保养、绑定司机。

### 2.8 通知中心
运单状态变更 / 派单 / 异常提醒三类通知，支持按类型筛选、只看未读、单条标记已读、全部标为已读。顶栏铃铛有未读数角标（60s 轮询）。

### 2.9 总部概览（admin）
统计卡（运单总数 / 在途 / 已签收 / 异常率 / 准时率 / 平均时效）+ 资源与金额卡 + 运单量趋势柱状图（新建 vs 异常）+ 状态分布环形图 + 异常类型分布 + 网点吞吐排行 + 热门线路 TOP + 司机负载 TOP 6 + 系统账号列表。支持 7 / 10 / 30 天时间窗切换。

### 2.10 403 / 404
无权限时渲染 403 页（说明当前角色可用范围），未匹配路由渲染 404 页。

---

## 三、状态机

8 个状态，非法流转后端返回 400：

```
created（已下单）
  → picked_up（已揽收）
  → in_transit（运输中）
  → arrived_hub（到达分拨）  ← 可退回 in_transit（错分纠正）
  → out_for_delivery（派送中）
  → delivered（已签收）      终态

任意非终态 → exception（异常：拒收 / 破损 / 地址错误 / 超时）
exception → returned（原路退回）        终态
exception → in_transit / out_for_delivery（改址后恢复派送）
```

一次流转在一个事务内完成六件事：状态机校验 → 更新运单 → 写 `status_logs` → 追加 `route_nodes` 时间轴节点 → 追加 `scan_records` → 写通知 + 司机完单计数。

前端不硬编码可流转状态，而是调 `GET /api/waybills/:id/next` 拿后端返回的允许列表，只渲染这些按钮。

---

## 四、AI 功能

三个功能，未配置 `LLM_API_KEY` 时自动降级为本地规则引擎，响应带 `source` 字段。

| 功能 | 接口 | 落库 |
|---|---|---|
| 时效预测 | `POST /api/ai/eta` | **写入 `waybills.estimated_delivery`** |
| 滞留识别 | `POST /api/ai/detect-stale` | **创建 `exceptions` 记录（source='ai'）** |
| 路线优化 | `POST /api/ai/optimize-route` | 即时返回派送顺序 |

**闭环**：时效预测写入的值被运单列表、详情页、准时率统计三处消费；滞留识别创建的异常记录出现在异常件页，可被正常处理（改址/退回/理赔）后关闭。

本地降级算法：时效用同线路历史均值为基线 + 重量体积修正；滞留用 SQL 查最后扫描时间；路线用最近邻贪心（Haversine 球面距离，重货保价件优先）。

---

## 五、数据表（12 张）

| 表 | 说明 | 种子行数 |
|---|---|---|
| `users` | 账号（admin / dispatcher / courier） | 3 |
| `customers` | 寄件人 / 收件人档案 | 16 |
| `warehouses` | 网点（含经纬度与覆盖范围） | 8 |
| `vehicles` | 车辆档案 | 6 |
| `drivers` | 司机档案 | 6 |
| `waybills` | 运单主表 | 30 |
| `packages` | 包裹明细 | 60 |
| `route_nodes` | 中转节点（时间轴的每一站） | 118 |
| `scan_records` | 扫描记录 | 118 |
| `exceptions` | 异常件 | 19 |
| `notifications` | 通知 | 16 |
| `status_logs` | 状态流转日志（审计） | 88 |

种子运单跨 10 天，8 个状态全覆盖（created 3 / picked_up 3 / in_transit 5 / arrived_hub 4 / out_for_delivery 4 / delivered 6 / exception 3 / returned 2）。

---

## 六、权限模型

| 角色 | 运单查询 | 创建运单 | 状态流转 | 调度台 | 异常处理 | 网点/车队 | 概览看板 |
|---|---|---|---|---|---|---|---|
| `admin` 总部 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `dispatcher` 调度员 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `courier` 快递员 | ✓ | ✓ | 仅自己名下 | ✗ | ✗ | ✗ | ✗ |

越权访问返回 403（前端也会隐藏对应导航项，双保险）。

---

## 七、目录结构

```
logitrack/
├── backend/
│   ├── kernel.js             内核出口
│   ├── src/
│   │   ├── domain.js         状态机 + 时间轴构建
│   │   ├── crud.js           通用 CRUD 工厂
│   │   └── routes/           waybills / exceptions / ai / ops
│   ├── db.js                 12 张表
│   ├── seed.js               种子数据
│   ├── routes.js             路由装配
│   ├── overview.js           Admin 概览指标
│   └── test/                 core.test.js（59 用例）+ app.test.js
├── frontend/
│   └── src/
│       ├── mapEngine.js      Leaflet 封装 + 离线降级
│       ├── components/       Timeline / MapPanel / WaybillCard / WaybillForms / ui / Icons
│       ├── pages/            11 个页面
│       ├── context/          AuthContext
│       ├── theme.js          Chakra 主题（Apple 令牌）
│       ├── constants.js      状态元数据 + 工具函数
│       └── api.js            请求封装
├── DESIGN.md                 设计文档（重点：联动实现 + AI 闭环）
├── start.sh / start.bat      一键启动
└── verify.sh                 验证脚本
```

---

## 八、前端状态完整性

每个页面都实现了五态：

| 状态 | 实现 |
|---|---|
| 加载 | 骨架屏（Apple 规范要求骨架而非转圈） |
| 空 | 图标 + 说明 + 行动按钮 |
| 错误 | 说明 + 重试按钮 |
| 无权限 | 403 页（说明当前角色可用范围） |
| 404 | 未匹配路由渲染 404 页 |

表单有行内校验、提交中禁用、失败保留输入。

---

## 九、API 一览

统一响应结构 `{ code, data, message }`，成功 `code=0`，鉴权用 `Authorization: Bearer <token>`。

**认证**
```
POST   /api/auth/register          注册
POST   /api/auth/login             登录
GET    /api/auth/me                当前用户
PUT    /api/auth/me                改资料
```

**运单**
```
GET    /api/waybills               列表（分页 / 搜索 / 筛选）
POST   /api/waybills               创建（含包裹明细）
GET    /api/waybills/:id           详情
GET    /api/waybills/:id/timeline  完整时间轴
PATCH  /api/waybills/:id/status    状态流转
POST   /api/waybills/:id/scan      节点扫描
GET    /api/waybills/:id/next      允许的下一步
GET    /api/waybills/:id/scans     扫描记录
DELETE /api/waybills/:id           删除（仅 admin）
```

**异常件**
```
GET    /api/exceptions             列表
GET    /api/exceptions/stats       统计
POST   /api/exceptions             登记
POST   /api/exceptions/:id/resolve 处理
POST   /api/exceptions/:id/close   关闭
GET    /api/exceptions/meta/actions 处理方式字典
```

**AI**
```
POST   /api/ai/eta                 时效预测（落库）
POST   /api/ai/detect-stale        滞留识别（落库）
POST   /api/ai/optimize-route      路线优化
```

**运营**
```
GET    /api/ops/dispatch/pending   待分配池
POST   /api/ops/dispatch/assign    指派
POST   /api/ops/dispatch/unassign  取消指派
GET    /api/ops/dispatch/summary   调度概况
GET    /api/ops/dashboard          看板统计
GET    /api/ops/notifications      通知列表
GET    /api/ops/notifications/unread-count
PATCH  /api/ops/notifications/:id/read
POST   /api/ops/notifications/read-all
GET    /api/ops/meta/statuses      状态机字典
GET    /api/ops/meta/options       下拉选项
GET    /api/ops/fleet/tasks        车队任务
```

**Admin**
```
GET    /api/admin/overview         概览（含趋势 / 排行 / 分布）
GET    /api/admin/users            用户列表
```

**通用 CRUD**（warehouses / vehicles / drivers / customers / packages / route-nodes / scan-records / notifications / status-logs）
```
GET|POST        /api/entities/:table
GET|PUT|DELETE  /api/entities/:table/:id
```

---

## 十、环境变量

复制 `.env.example` 为 `.env`：

```ini
SECRET_KEY=change-me-to-a-random-string
JWT_SECRET=change-me-too
PORT=4205

# 可选：配置后 AI 走真实大模型，留空则用本地规则降级
LLM_API_KEY=
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

---

## 十一、技术要点

- **时间轴与地图双向联动**：`selectedId` 单一真相源，两侧受控；`from` 标记区分方向，避免"点时间轴自己把位置滚走"。详见 `DESIGN.md`。
- **状态机事务化**：一次流转的六个副作用在同一 SQLite 事务内完成，不会出现"状态变了但时间轴没节点"。
- **地图离线降级**：`tileerror` 累计阈值 + 加载超时双保险，切网格底图后定期探测恢复；无论底图如何，路线与标记始终可用。
- **深色模式无闪烁**：Chakra 语义令牌绑定 CSS 变量，主题切换由 `prefers-color-scheme` 驱动，JS 不参与判断。
- **零图表库**：柱状图 / 横条排行 / 环形图全部用 CSS（含 `conic-gradient`）实现，不引入图表依赖。
- **动效降级**：所有动画都有 `prefers-reduced-motion: reduce` 分支；唯一的循环动画（运输中节点的流动虚线）承载"货在路上"的语义。
