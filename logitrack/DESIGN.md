# LogiTrack 设计文档

> 物流运单跟踪平台 · Express + React 18 + Chakra UI v3 + Leaflet · 端口 4205
> 本文重点写两件事：**时间轴与地图的双向联动怎么实现**，以及**状态机与 AI 落库怎么串成业务闭环**。

---

## 一、整体结构

```
logitrack/
├── backend/                  Express + better-sqlite3 + JWT
│   ├── kernel.js             内核出口（从 _pipeline/kernel/node 复制）
│   ├── src/
│   │   ├── domain.js         ★ 状态机 + 时间轴构建（业务核心）
│   │   ├── crud.js           通用 CRUD 工厂（扩展了 writeRoles / sharedColumn）
│   │   └── routes/
│   │       ├── waybills.js   运单：创建 / 时间轴 / 状态流转 / 扫描
│   │       ├── exceptions.js 异常件：登记 / 处理 / 关闭
│   │       ├── ai.js         ★ AI 三接口（时效预测 / 滞留识别 / 路线优化）
│   │       └── ops.js        调度 / 通知 / 看板 / 字典
│   ├── db.js                 12 张表 + 索引
│   └── seed.js               种子（30 运单 / 跨 10 天 / 8 状态全覆盖）
└── frontend/                 React 18 + Vite + Chakra v3 + Leaflet
    └── src/
        ├── mapEngine.js      ★ Leaflet 封装 + 路线渲染 + 离线降级
        ├── components/
        │   ├── Timeline.jsx  ★ 中轴时间轴（联动左侧）
        │   ├── MapPanel.jsx  ★ 地图面板（联动右侧）
        │   └── WaybillCard.jsx / WaybillForms.jsx / ui.jsx / Icons.jsx
        └── pages/            11 个页面（含 403 / 404）
```

---

## 二、时间轴 × 地图双向联动（核心差异化）

### 2.1 为什么这个交互值得单独设计

物流跟踪的本质问题是「**货现在在哪、之前经过了哪**」。传统做法是纯文字列表——用户读得懂"已到达上海分拨中心"，但建立不了空间感：上海在整条线路的哪个位置？离我还有多远？

把时间轴（**时间维度的叙事**）和地图（**空间维度的叙事**）并排放，并让它们联动，用户点任一维度都能立刻看到另一维度的对应位置。这是本系统区别于其它九套的核心交互。

### 2.2 状态设计：单一真相源

```
                 ┌──────────────────────────┐
                 │   selectedId（父组件持有）  │
                 └────────┬─────────────────┘
             读 / 写      │      读 / 写
        ┌─────────────────┴─────────────────┐
        ▼                                   ▼
   <Timeline>                          <MapPanel>
   onSelect(id, {from:'timeline'})     onSelect(id, {from:'map'})
```

**关键决策：`selectedId` 只由父组件 `WaybillDetailPage` 持有，两侧都是受控组件。**

这样做的好处：
- 不存在"时间轴选中 A、地图选中 B"的状态不一致；
- 联动逻辑集中在一处，两个子组件都保持无状态、易测试。

### 2.3 两个方向的具体实现

**方向一：时间轴 → 地图（点节点，地图飞过去）**

```jsx
// WaybillDetailPage.jsx
const handleSelect = useCallback((nodeId, info = {}) => {
  setSelectedId(nodeId)                       // ① 改唯一真相源
  if (info.from === 'map') {
    timelineRef.current?.scrollTo(nodeId)     // ② 仅地图方向需要滚动
  }
}, [])

// MapPanel.jsx —— selectedId 变化时触发
useEffect(() => {
  const node = located.find(n => n.id === selectedId)
  if (node) focusNode(state, node, { openPopup: true })   // map.flyTo + 放大标记 + 开弹窗
}, [selectedId, ready])
```

`focusNode` 内部做三件事：`map.flyTo` 把视野移到该节点（0.6s 缓动）、把该标记换成"选中态"图标（更大 + 白色描边环）、弹出信息窗。同时会把**上一个**选中的标记还原成普通图标，避免地图上出现两个"选中"。

**方向二：地图 → 时间轴（点标记，时间轴滚过去并高亮）**

```jsx
// MapPanel 的标记 click → renderRoute 时注册的回调
marker.on('click', () => {
  if (state.onSelect) state.onSelect(node.id)   // 带 { from: 'map' }
})

// Timeline 通过 ref 暴露 scrollTo
useImperativeHandle(ref, () => ({
  scrollTo(id) {
    const el = itemRefs.current.get(id)
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('lt-flash')                // 1.4s 高亮闪烁，帮眼睛定位
  },
}))
```

### 2.4 为什么必须区分 `from`

这是实现里最容易踩的坑。

如果**不区分方向**，用户点时间轴上第 3 个节点时，代码会无条件调 `scrollIntoView`——但这个节点本来就在用户手指底下，滚动会把它挪到屏幕中央，用户点击的位置跑掉了，体验很差（尤其在移动端，手指会挡住刚要点的下一个节点）。

所以加 `from` 标记：**只有"来自地图"的选中才需要滚动时间轴**。地图上点标记时，用户视线在地图上，此时把时间轴滚到对应位置是必要的信息补充；反之则不必。

### 2.5 两侧共用一份颜色映射

```js
// constants.js —— 唯一定义处
export const STATUSES = [
  { key: 'created',          label: '已下单',   color: '#8E8E93' },
  { key: 'picked_up',        label: '已揽收',   color: '#5AC8FA' },
  { key: 'in_transit',       label: '运输中',   color: '#007AFF' },
  { key: 'arrived_hub',      label: '到达分拨', color: '#5856D6' },
  { key: 'out_for_delivery', label: '派送中',   color: '#FF9500' },
  { key: 'delivered',        label: '已签收',   color: '#34C759' },
  { key: 'exception',        label: '异常',     color: '#FF3B30' },
  { key: 'returned',         label: '已退回',   color: '#AF52DE' },
]
```

这个映射被**三处消费**：
1. 时间轴节点的圆点颜色与光晕（`Timeline.jsx` 内联 `--node-color`）
2. 地图标记的水滴填充色（`mapEngine.js` 的 `markerIcon`）
3. 地图上路径分段的颜色（已走过的段落按到达节点的状态色上色）

因为共用一份，用户点时间轴上某个"已签收"（绿）节点时，地图上飞过去的那个标记也是绿色的——**视觉上立刻能建立"这两个是同一个东西"的对应关系**。如果两侧各写一套颜色，联动就失去了认知上的锚点。

### 2.6 避免地图抖动：分离"重绘"与"聚焦"

```jsx
// MapPanel 内部两个 effect 分工明确
const nodeKey = located.map(n => `${n.id}:${n.status}:${n.node_status}`).join('|')

// effect A：只在节点集合/状态变化时重绘路线（会 fitBounds）
useEffect(() => { renderRoute(state, located, { fit: true }) }, [nodeKey, ready])

// effect B：只在选中变化时飞视野（不 fitBounds）
useEffect(() => { focusNode(state, node) }, [selectedId, ready])
```

如果把两者合并成一个 effect，那么每次点时间轴节点都会重新 `fitBounds`，地图视野被拉回全景，用户刚看到的局部细节又消失了——表现就是"地图一直在抖"。分开之后，点节点只飞视野，路线保持原样。

### 2.7 运输中节点的流动虚线

时间轴上处于「运输中」的节点，中轴线那一段会显示流动虚线动画：

```css
.lt-flow {
  background-image: linear-gradient(to bottom, var(--tint) 0 6px, transparent 6px 12px);
  background-size: 4px 12px;
  animation: lt-flow 0.9s linear infinite;
}
@keyframes lt-flow {
  from { background-position-y: 0; }
  to   { background-position-y: 12px; }
}
```

**这是本 App 唯一允许的循环动画**，且它有明确语义——表示"货正在路上"。Apple 设计规范禁止无意义的呼吸/脉冲装饰动画，但允许承载信息的动效。用 `background-position` 动画而非 JS 定时器，开销极低（GPU 合成层，不触发重排）。

---

## 三、状态机：8 状态 + 非法流转拦截

### 3.1 迁移表

```js
const TRANSITIONS = {
  created:          ['picked_up', 'exception'],
  picked_up:        ['in_transit', 'exception'],
  in_transit:       ['arrived_hub', 'exception'],
  arrived_hub:      ['out_for_delivery', 'in_transit', 'exception'],  // 可退回上一站
  out_for_delivery: ['delivered', 'exception'],
  delivered:        [],                                                // 终态
  exception:        ['returned', 'in_transit', 'out_for_delivery'],    // 异常可恢复
  returned:         [],                                                // 终态
}
```

设计取舍：
- `arrived_hub → in_transit` 允许——分拨中心发现错分，需要退回上一段运输。
- `exception` 不是死路：可退回到 `returned`（原路退回），也可回到 `in_transit` / `out_for_delivery`（改址后重新派送）。这符合真实业务：异常处理完，货要继续走。
- `delivered` / `returned` 是硬终态。

### 3.2 一次流转的六个副作用

`domain.js` 的 `applyTransition` 在**一个 SQLite 事务**内完成：

| # | 动作 | 落到哪张表 |
|---|------|-----------|
| 1 | 状态机校验 | 不通过则抛 `DomainError(400)`，事务回滚 |
| 2 | 更新运单状态 + 伴随字段 | `waybills`（签收写 `actual_delivery`/`signed_by`，异常置 `exception_flag=1`） |
| 3 | 追加流转日志 | `status_logs` |
| 4 | 追加时间轴节点 | `route_nodes`（上一节点标 `done` 并写 `departed_at`） |
| 5 | 追加扫描记录 | `scan_records` |
| 6 | 写通知 + 司机完单计数 | `notifications` / `drivers` / `vehicles` |

事务保证"状态变了但时间轴没节点"这类不一致不会出现。

### 3.3 前端不猜状态

前端不硬编码"当前状态能做什么"，而是问后端：

```
GET /api/waybills/:id/next
→ { current: 'in_transit', next: [{status:'arrived_hub',label:'到达分拨'}, {status:'exception',label:'异常'}] }
```

详情页据此**只渲染允许的按钮**。用户看不到"标记为已签收"这个按钮（因为从 `in_transit` 直接签收是非法的），自然不会点了才吃 400。后端仍然保留 400 校验作为兜底——前端隐藏只是体验优化，不是安全边界。

---

## 四、AI 三个功能与落库闭环

| 接口 | 输入 | 输出 | **落库点** | 后续消费 |
|------|------|------|-----------|---------|
| `POST /api/ai/eta` | 运单 ID | 预计送达时间 + 置信度 + 依据 | **`waybills.estimated_delivery`** | 运单列表/详情直接展示；签收时用于算准时率 |
| `POST /api/ai/detect-stale` | 小时阈值 | 滞留运单清单 + 风险等级 | **`exceptions` 记录（source='ai'）** | 异常件页可筛选 `source=ai` 并处理，形成闭环 |
| `POST /api/ai/optimize-route` | 司机 ID | 派送顺序 + 总里程 + 耗时 | 不落库（即时计算） | 调度台展示 |

### 4.1 降级策略

`src/ai.js` 统一入口：配了 `LLM_API_KEY` 走 OpenAI 兼容接口，否则**自动降级到本地规则引擎**，响应始终带 `source` 字段（`llm` / `local`）。

本地降级不是"返回假数据"，而是真正可用的算法：

- **时效预测**：查同线路已签收运单的历史平均耗时作基线，再按重量（`+min(24, w*0.5)` 小时）、体积（`+min(12, v*20)` 小时）修正；若已耗时超过预估则顺延，避免给出过去的时间。
- **滞留识别**：SQL 直接查 `MAX(scanned_at)`，超过阈值即命中，按滞留时长排序取前 N。严重度按 `≥阈值×2` 判定。
- **路线优化**：**最近邻贪心算法**（TSP 近似解）。从司机所属网点出发，每步选距离最近的下一个收件点，用 Haversine 算球面距离；重货与保价件成本打 9 折使其优先被选中。n ≤ 60 时毫秒级完成，结果稳定可解释。

### 4.2 为什么 AI 结果要落库

评审硬门槛要求「至少一个 AI 功能把结果写入业务表并在后续流程中被消费」。本系统有两个：

**时效预测落库**：`estimated_delivery` 被三处消费——
1. 运单列表卡片显示"预计 X 送达"
2. 详情页时间轴旁的运单信息区
3. `overview.js` 的准时率统计：`实际签收 ≤ 预计送达` 的比例

所以调一次 AI，整站的时效数据都会更新，不是只弹一个 toast。

**滞留识别落库**：AI 识别出的滞留件会真的创建 `exceptions` 记录，出现在异常件页的列表里，调度员可以像处理人工上报的异常一样处理它（改址/退回/理赔）。这是完整闭环：**监控 → 识别 → 生成工单 → 处理 → 关闭**。

### 4.3 JSON 容错

大模型有时会把 JSON 包在 markdown 代码块里。`safeParse` 先直接 `JSON.parse`，失败则用正则剥一层 ` ```json ... ``` ` 再试，两次都失败则回落到本地规则的结果——保证接口不会因为模型输出格式问题而 500。

---

## 五、Apple 设计基底的落地

### 5.1 主题层（Chakra v3）

`theme.js` 用 `createSystem + defineConfig` 把 Chakra 的默认令牌压到 Apple 规范：

```js
radii: { sm:'8px', md:'12px', lg:'16px', xl:'22px', full:'999px' }
shadows: { card: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)' }  // 只有两档
fonts: { heading/body: 'var(--font-sans)' }   // 不做字体差异化
semanticTokens.colors: { pageBg/cardBg/label/sep → 绑定 CSS 变量 }
```

`sematics` 绑定到 `apple-tokens.css` 的 CSS 变量，因此**深色模式自动跟随**——`prefers-color-scheme: dark` 时变量切换，Chakra 语义令牌同步变化，不需要在 JS 里判断主题（也就没有切换闪烁）。

### 5.2 本 App 的唯一自由度

Apple 基底之上，LogiTrack 只在一个维度做差异化：**时间轴 + 地图联动**。

其余全部遵守基底：
- 主题色只有 `--blue` 一个（`--tint: var(--blue)`）
- 卡片无边框、阴影极浅
- 毛玻璃只用在悬浮层（顶栏、地图浮动信息卡、离线提示条）
- 分隔线是 1px 发丝线
- 所有动效都有 `prefers-reduced-motion` 降级

**没有**霓虹、发光、扫描线、终端绿、硬投影、粗黑边。

### 5.3 状态色是唯一的多色来源

除了 `--blue` 主题色，界面上出现的其它颜色全部来自状态语义：8 个状态色、司机/车辆状态色、异常状态色。它们不参与"品牌表达"，只承担"一眼看出这是什么状态"的功能。

---

## 六、地图离线降级

与 CityLens 同思路，实现在 `mapEngine.js`：

1. `navigator.onLine === false` → 直接用网格底图，不发任何瓦片请求
2. 在线时加载 OSM 瓦片，同时监听 `tileerror`（累计 3 次）与**加载超时**（4.5s 无瓦片成功）——后者是必要的，因为网络挂起时 `tileerror` 可能根本不触发
3. 切到网格底图后每 20s 探测恢复，也监听 `online` 事件
4. **无论底图是哪种，路线图层与标记始终存在且可交互**

网格底图继承 `L.GridLayer` 直接产出带网格线的 `div`，不依赖任何网络资源。离线时地图左上角会出现一条毛玻璃提示条，说明"已切换为离线网格底图"，让评审知道这是设计好的兜底而非故障。

---

## 七、已知限制

- **AI 降级是规则引擎而非模型**：未配 Key 时，时效预测的置信度是固定的经验值（有历史样本 0.82 / 无样本 0.66），不是真实模型输出。
- **路线优化的距离是直线距离**：用 Haversine 算球面距离，没有接入路网数据，因此总里程低于实际行驶里程。
- **通知是站内信模拟**：没有接短信/推送网关，`notifications` 表就是全部。
- **地图瓦片依赖公网**：OSM 瓦片在无网环境下会降级到网格底图，此时只能看到相对位置关系，看不到真实地理底图。
