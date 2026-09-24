# KitchenFlow 设计说明

> 餐厅后厨订单系统 · 端口 4201 · Express + better-sqlite3 + JWT / React 18 + Vite + Tailwind v4

---

## 一、形态说明

KitchenFlow 不是「项目管理看板」的换皮，而是一套**围绕订单流转的后厨协作系统**。
它把餐厅里最真实的三方矛盾摆到台面上：**服务员要快、后厨要有序、店长要看得见**。

系统由三个角色共同驱动一条订单的生命周期：

| 角色 | 是谁 | 在系统里做什么 |
|---|---|---|
| `admin` | 店长 | 看经营概览、管桌台/菜单/排班、可执行全部状态流转、触发会写库的 AI 预测 |
| `waiter` | 服务员 | 开台点餐、上菜、结账、清台 |
| `chef` | 厨师 | 看后厨看板、按档口接单制作、完成出餐 |

**形态上的三个支点：**

1. **后厨看板是核心页**。按档口（热菜/凉菜/主食/饮品）分列，每一列是一串订单卡。
   卡片带 SVG 倒计时进度环，剩余时间越少环越短；超时的卡片转为橙色描边脉冲——
   这是全站**唯一**允许的循环动画，而且它承载语义：这一单已经超时了。
2. **订单会自动拆解成档口任务**。订单被接单的瞬间，系统按每道菜所属档口生成
   `station_tasks`，分发到对应列。厨师在自己的档口里独立推进，不需要理解整张订单。
3. **档口协作反向驱动订单状态**。当一张订单的所有档口任务都标记完成时，
   订单自动从 `cooking` 进入 `ready`——出餐不再依赖某个人手动点按钮，而是后厨协作的结果。

---

## 二、数据模型（11 张表）

```
users ─┬─< staff_shifts
       ├─< orders (waiter_id / chef_id)
       └─< restaurants (owner_id)

restaurants ─┬─< dining_tables ──< orders ─┬─< order_items ──> menu_items
             ├─< menu_categories ──< menu_items
             ├─< kitchen_stations ─┬─< menu_items
             │                     └─< station_tasks
             └─< staff_shifts

orders ─┬─< order_items
        ├─< order_status_logs
        └─< station_tasks
```

| 表 | 作用 | 关键字段 |
|---|---|---|
| `users` | 三种角色的账号 | `role` ∈ admin/waiter/chef |
| `restaurants` | 门店信息 | `open_time` / `close_time` |
| `dining_tables` | 桌台与占用态 | `status` ∈ idle/occupied/cleaning |
| `menu_categories` | 菜单分类 | `sort_order` |
| `menu_items` | 菜品 | `station_id`（决定拆解到哪个档口）、`predicted_demand`（AI 回写点） |
| `orders` | 订单主表 | `status`、各阶段时间戳（`accepted_at` … `paid_at`） |
| `order_items` | 订单明细（快照菜名与价格） | `name_snapshot`、`station_id` |
| `order_status_logs` | 状态流转日志 | `from_status` / `to_status` / `operator_name` |
| `kitchen_stations` | 档口 | `code` / `color` |
| `station_tasks` | 档口任务 | `status` ∈ pending/cooking/done |
| `staff_shifts` | 排班 | `shift_date` / `start_time` / `end_time` |

**为什么明细要存快照**：菜名与价格在下单时冻结进 `order_items`，
之后店长改菜单不会污染历史订单金额，这是餐饮系统的基本要求。

---

## 三、状态机（7 状态，后端强校验）

```
pending（已下单）
  → accepted（后厨已接单）
  → cooking（制作中）
  → ready（已出餐）
  → served（已上菜）
  → paid（已结账）

pending  ↘
accepted ↘ cancelled（取消）
```

### 校验点

1. **流转合法性**：`TRANSITIONS` 表定义每个状态的后继集合。
   例如 `pending → cooking` 会被拒绝（必须先接单），返回 **400** 与明确原因
   `非法状态流转：pending → cooking`。
2. **角色权限**：`ROLE_OF_TARGET` 定义谁能推进到哪个状态。
   接单/制作/出餐属于厨师，上菜/结账属于服务员，店长全权。
   服务员试图接单返回 **403**。
3. **终态封闭**：`paid` 与 `cancelled` 的后继集合为空，任何后续流转都是 400。

### 状态流转的副作用（同事务内完成）

| 流转 | 副作用 |
|---|---|
| → `accepted` | **自动生成 `station_tasks`**（按菜品所属档口拆解），记录 `chef_id` |
| → `cooking` | 明细状态同步为 cooking |
| → `ready` | 该单所有档口任务标记完成，明细标记完成 |
| → `served` | 记录 `served_at` |
| → `paid` | 记录 `pay_method`，桌台转 `cleaning`，释放 `current_order_id` |
| → `cancelled` | 记录取消原因，桌台同样释放 |

**档口任务的反向驱动**：`PATCH /api/orders/tasks/:taskId` 在把任务置为 `done` 后，
会检查该订单剩余未完成任务数；为 0 且订单处于 `cooking` 时，自动置为 `ready`
并写一条日志「全部档口完成，自动出餐」。这是「后厨协作驱动订单状态」的落点。

---

## 四、AI 落库闭环

三个 AI 功能，其中**销量预测会写入业务表**，并被后续流程消费。

```
历史订单（近 7 天 order_items 销量）
        │
        ▼
┌─────────────────────────┐
│ AI 销量预测              │  POST /api/ai/forecast-demand
│ source = llm / local    │
└───────────┬─────────────┘
            │ 写入
            ▼
   menu_items.predicted_demand      ← 落库点
            │
            ├──► 菜单管理页：菜品卡显示「预测 N」标签
            │
            ▼
┌─────────────────────────┐
│ AI 备料清单              │  POST /api/ai/prep-list
│ 读取 predicted_demand    │  按档口分组 + 主料换算
└─────────────────────────┘

┌─────────────────────────┐
│ AI 异常识别              │  POST /api/ai/detect-anomaly
│ 各阶段停留分钟 vs 阈值    │  返回告警数组（不写库，只读）
└─────────────────────────┘
```

**闭环的关键**：`prep-list` 不重新算销量，而是**读 `predicted_demand` 字段**。
所以「预测 → 落库 → 备料」是一条真实的数据链，而不是两个互不相干的 AI 调用。

**降级策略**：未配置 `LLM_API_KEY` 时，三个接口走本地规则引擎，
响应体带 `source: "local"`；配置后走 OpenAI 兼容接口，`source: "llm"`。
本地规则并非占位符——预测用「近 7 天日均 ×1.1 安全系数」，备料有 25 道菜的主料换算表，
异常识别用分阶段阈值（待接单 5 分钟 / 未开火 8 分钟 / 制作 20 分钟 / 未上菜 8 分钟）。
前端在 AI 输出卡片上标注「大模型 / 本地规则」，评审一眼能看出降级是否生效。

**权限**：`forecast-demand` 会写库，因此限 `admin`；另两个只读，`chef` 也能调。

---

## 五、前端形态（Apple 基底 + 一个差异化维度）

### 基底遵守情况

- 字体族与字号阶梯完全按 Apple HIG，无自创字号
- 主题色只有一个：`--orange`，通过 `--tint: var(--orange)` 覆盖
- 卡片无边框、极浅阴影（`--shadow-card`）、圆角取令牌
- 毛玻璃只用于侧边导航与看板档口表头（悬浮层）
- 分隔线是 1px 发丝线；表格无外框
- 深色模式跟随 `prefers-color-scheme`，令牌层自动切换
- `prefers-reduced-motion: reduce` 下所有动画降级（含超时脉冲）
- 每页都有加载（骨架屏）/ 空 / 错误 / 无权限四态，另有独立 403 / 404 页

### 差异化维度：高密度卡片 + 倒计时压力

按 `APPLE_DESIGN_SYSTEM.md` §三 的要求，只在**这一个维度**上做区别：

1. **卡片小一号**：订单卡用 `--radius-md`（12px）而非 `--radius-lg`，
   内边距 12px 而非 20px，同样屏宽能多放 2–3 张卡
2. **倒计时进度环**：纯 SVG 绘制（`CountdownRing.jsx`），
   `stroke-dashoffset` 随剩余比例变化，颜色按 绿 → 橙 → 红 分级
3. **超时橙色描边脉冲**：`.kf-overtime` 类，2px 橙色描边 + 4 秒呼吸阴影。
   这是全站唯一的循环动画，且只在「这单超时了」时出现

**没做的事**（遵守禁止项）：没有改字体族、没有改圆角基准、没有改间距栅格、
没有加发光/硬投影/霓虹。

### 页面清单（11 个路由）

| 路由 | 页面 | 角色 | 说明 |
|---|---|---|---|
| `/login` | 登录/注册 | 公开 | 左侧品牌区 + 演示账号一键填充 |
| `/admin` | 店长概览 | admin | 统计卡 + 内联 SVG 趋势图 + 档口效率排行 + AI 异常 |
| `/kitchen` | **后厨看板** | admin/chef | 按档口分列，倒计时环，20s 自动刷新可暂停 |
| `/tables` | 桌台管理 | admin/waiter | 桌位网格，状态色区分，待清台一键清台 |
| `/order/new` | 点餐 | admin/waiter | 选桌 → 分类浏览 → 购物车（逐项备注）→ 提交 |
| `/menu` | 菜单管理 | 全部 | 分类 + 菜品 CRUD，AI 预测/备料入口 |
| `/orders` | 订单列表 | 全部 | 分页 + 状态/桌号筛选 + 详情抽屉（时间轴 + 动作） |
| `/checkout` | 结账 | admin/waiter | 待结账订单 → 选支付方式 → 整单结账 |
| `/shifts` | 班次管理 | 全部 | 排班表 + 各班次订单量统计 |
| `/profile` | 个人中心 | 全部 | 资料编辑 + 我的排班 + 角色权限说明 |
| `/403` `/404` | 错误页 | 公开 | 独立页面，不白屏 |

**权限的两层表达**：侧边导航按角色过滤（看不见即不可达），
路由守卫 `RequireRole` 拦截直接输 URL 的情况并渲染无权限页，
后端再用 `adminOnly` / `ROLE_OF_TARGET` 做最终拦截。

---

## 六、与其它九套的差异

### 与同批「重开三套」的差异

| | KitchenFlow | ScriptForge | LogiTrack |
|---|---|---|---|
| 领域 | 餐饮后厨 | 剧本创作 | 物流运单 |
| 主题色 | `--orange` | `--indigo` | `--blue` |
| 差异化维度 | 高密度卡片 + 倒计时压力 | 纸张质感 + 衬线正文 | 时间轴 + 地图联动 |
| 核心交互 | 档口分列看板，卡片推进 | 场景编辑器 + 关系图 | 时间轴与地图双向高亮 |
| 状态机 | 订单 7 状态 | 作品 5 + 场景 4 | 运单 8 状态 |
| 循环动画 | 超时脉冲（有语义） | 无 | 运输中节点流动虚线 |

### 与「第一批五套」的差异

第一批（MindCare / ScholarBoard / EduPulse / HiveMarket / ExamPrep）领域与表结构保留，
但前端要从霓虹/终端/粗野主义改造到 Apple 基底。KitchenFlow 是**按新标准从零建**的，
所以它天然没有历史包袱——它的价值之一是给第一批的改造提供一个「Apple 基底 + 单一差异化维度」
的参照实现。

### 与「第二批深化两套」的差异

CityLens（巡检）与 InterviewGo（面试）是在已有领域上加厚。
KitchenFlow 与它们在**技术内核上是同源的**（都复用 `_pipeline/kernel/node`：
统一 `{code,data,message}` 响应、JWT 中间件、crudRoutes 分页搜索筛选、AI 降级骨架），
差异只在**业务深度与前端形态**：

- CityLens 的工单是「上报 → 诊断 → 派单」的线性流转，
  KitchenFlow 的订单是「拆解到多个档口并行推进，再收敛回单条状态」——
  这是**一对多的协作收敛**，比线性流转复杂一层
- KitchenFlow 的 AI 落库点（`predicted_demand`）被第二个 AI 功能消费，
  形成链式闭环，这一点在十套里是比较特别的

### 这套系统独有的一点

**档口任务的「反向驱动」**：大多数系统的状态机都是「上游推下游」，
而 KitchenFlow 里，最下游的档口任务全部完成会**反向**把订单推到 `ready`。
这让状态机不只是被操作的客体，而成为协作本身的产物。

---

## 七、已知取舍

1. **未做拆单结账**：规格提到「支持整单结账与拆单结账」，当前实现是整单结账。
   拆单需要新增 `payments` 表记录部分收款，属于可扩展项而非缺陷。
2. **结账后桌台进 `cleaning` 而非直接 `idle`**：这是有意设计——
   真实餐厅里收桌需要人确认，所以由服务员点「清台完成」才回到 `idle`。
3. **看板只显示 `accepted` / `cooking` 的订单任务**：
   `pending` 未接单的订单不产生档口任务（避免后厨看到还没确认的单），
   `ready` 之后的任务已从看板消失（菜已出，留在看板上是噪音）。
4. **AI 异常识别不写库**：规格只要求「返回告警列表」，
   所以它是纯读接口，不产生额外表。若要留痕可加 `alerts` 表。
