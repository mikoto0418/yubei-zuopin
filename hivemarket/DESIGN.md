# HiveMarket 前端设计文档

> 校园二手交易平台 · 前端改造记录
> 技术栈：Vue 3 + Vite + vue-router + **PrimeVue 4**

---

## 1. 使用的组件库

| 类别 | 选型 | 版本 |
|------|------|------|
| 框架 | Vue 3 | ^3.5.13 |
| 构建 | Vite | ^6.0.7 |
| 路由 | vue-router | ^4.5.0 |
| **UI 组件库** | **PrimeVue** | **^4.5.5** |
| **主题引擎** | **@primeuix/themes** | **^3.0.1** |
| **图标库** | **primeicons** | **^8.0.1** |
| 图表 | ECharts | ^5.6.0 |

改造前：全手写 CSS（`styles.css` 约 300 行）+ 一个自研 `Modal.vue` 外壳。
改造后：PrimeVue 4 组件承载全部交互外壳，手写 CSS 退化为「主题层 / 粗野主义装饰层」。

### 主题配置方式

`src/theme.js` 用 `definePreset(Aura, {...})` 在 Aura 基础上改写 token：

- `semantic.primary`：整条红色梯度以 `#e63946` 为 500 档
- `semantic.borderRadius`：`none/xs/sm/md/lg/xl` **全部置 0** —— 全站方形
- `semantic.formField` / `focusRing`：焦点环宽度 0（改用黑色描边 + 硬阴影表达焦点）
- `components.*`：Button / Card / DataTable / Dialog / Tag / Paginator / Steps / Timeline / Toast / ConfirmDialog / Badge / Avatar 逐组件定制 token

`src/main.js` 注册 `PrimeVue`、`ToastService`、`ConfirmationService`、`v-tooltip`，并做了**中文 locale**（日期、分页、确认按钮等）。

---

## 2. 视觉方向：粗野主义电商（Brutalism E-commerce）

保留并强化的签名元素：

| 元素 | 实现 |
|------|------|
| **3px 黑色粗边框** | `--border: 3px solid #111111`；PrimeVue 组件用 `!important` 覆盖为黑边 |
| **5px 5px 0 黑色硬阴影** | `--shadow: 5px 5px 0 0 var(--black)`，无模糊、无透明度 |
| **顶部滚动公告条 ticker** | `.topbar` + `@keyframes ticker` 22s 线性无限滚动，等宽字体 + 黄字黑底 |
| **红黑撞色** | 主红 `#e63946` + 纯黑 `#111111`，辅色黄 `#f4c430` |
| **纸感底色** | `--paper: #f4efe6`（body 背景） |
| **粗体大标题** | `font-weight: 900` + `letter-spacing: -0.5px`，Hero 标题 44px 大写 |

粗野主义特有的「不完美感」细节：

- 按钮 hover 时**位移 2px 并收缩阴影**（`translate(2px,2px)` + `1px 1px 0`），模拟物理按压
- 价格标签 `.price-tag` **旋转 -3deg** 并带硬阴影，像爆裂价签
- 导航当前项 `router-link-active` **旋转 -1deg** + 黄红叠影
- Dialog **整体旋转 -0.6deg**，像贴在屏幕上的纸片
- 卡片 hover **向左上位移 2~4px 并放大阴影** 到 `8px 8px 0`
- 卡片底部用 **2px 黑色虚线** 分隔，像撕下来的票根
- 角标 `.cat-tag` / `.stamp-badge` 各自带不同方向的硬阴影，形成拼贴感

PrimeVue 组件被「粗野化」的关键 CSS（`styles.css` 内）：

```css
.p-button { border: 3px solid var(--black) !important; box-shadow: var(--shadow-sm) !important; }
.p-datatable .p-datatable-thead > tr > th { background: var(--black); color: #fff; border: 2px solid var(--black); }
.p-dialog { border: var(--border); box-shadow: var(--shadow-lg); transform: rotate(-0.6deg); }
```

---

## 3. 组件映射表

### 3.1 全局

| 位置 | 原实现 | 现实现 |
|------|--------|--------|
| 导航用户头像 | `<span class="nav-user">👤 昵称</span>` | `Avatar`（方形）+ 昵称 |
| 登录/注册/退出按钮 | `<a class="btn btn-small">` | `Button`（`severity="danger" / "secondary"`） |
| 全局弹窗服务 | 无 | `Toast` + `ConfirmDialog`（挂载在 `App.vue`） |
| 通用弹窗外壳 `Modal.vue` | 自研 `Teleport` + `Transition` + 手写遮罩 | **`Dialog`** 包裹（保留原 props 接口 `open/title/width`，内部页面零改动） |
| 错误/成功提示 | `.alert.alert-red / -green / -yellow` | `Message`（`severity="error" / "success" / "warn"`） |

### 3.2 逐页映射

| 页面 | PrimeVue 组件 |
|------|--------------|
| **Home** 逛集市 | `InputText`（搜索）、`InputNumber`（价格区间）、`Button`（淘一淘/清空/分类胶囊）、`Tag`（AI 推荐）；**瀑布流 + `IntersectionObserver` 无限滚动**（`Paginator` 已移除，`page`/`pageSize` 语义不变） |
| **ItemDetail** 商品详情 | `Tag`（状态 + 分类成色）、`Avatar`（卖家）、`Button`（下单/收藏/聊一聊）、**`Steps`（交易状态机）** —— 现以**右侧抽屉**呈现（`ItemDrawer.vue`），直链 `/item/:id` 仍可达 |
| **Publish** 发闲置 | 现为**全屏 5 步向导**（`PublishWizard.vue`）：`InputText`、`InputNumber`、`Textarea`、`Select`、`Button`、`Message`；**AI 智能上架保留**（第 3 步） |
| **Edit** 编辑商品 | 同 Publish（`Select` ×2、`InputNumber` 带 2 位小数） |
| **Wants** 求购 | `InputText`、`InputNumber`、`Textarea`、`Button`、`Tag`、`Message` |
| **Orders** 我的订单 | **`DataTable` + `Column`**（订单列表）、`Tag`（状态）、**`Steps`（状态机总览）**、**`Timeline`（每单交易进度）**、`Button`（确认/取消/联系） |
| **Chat** 站内 IM | `Avatar`（对话方）、`Badge`（未读数）、`InputText`（输入框）、`Button`（发送）、`Tag`；主体为共用的 `ChatPanel`，浮层形态见 `ChatDock` |
| **Favorites** 收藏 | **`Card`**（收藏卡片）、`Tag` |
| **Mine** 个人中心 | **`DataTable` + `Column`**（我的发布，含缩略图/状态/操作列）、`Avatar`、`Button`、`Tag`、`Message` |
| **Admin** 后台仪表盘 | `Card`（9 张统计卡 + 4 张图表卡）、`Tag`、`Message`；**ECharts 四图全部保留** |
| **Login / Register** | `InputText`、`Select`（校区）、`Button`、`Tag`、`Message` |
| **Forbidden / NotFound** | `Button` + primeicons 图标（`pi-ban` / `pi-file-excel`） |
| **AIPolish** 组件 | `Textarea`、`Button`、`Dialog`（预览确认） |
| **ItemDrawer** 组件（☆ 新增） | `Tag`、`Avatar`、`Button`、`Steps`、`Message` + `Markdown`；右侧滑出抽屉 |
| **PublishWizard** 组件（☆ 新增） | `InputText`、`InputNumber`、`Textarea`、`Select`、`Button`、`Message` + `AIPolish`；全屏分步向导 |
| **ChatPanel** / **ChatDock**（☆ 新增） | `InputText`、`Button`、`Badge`、`Avatar`；浮层聊天窗与 `/chat` 页共用 |
| **Markdown** 组件 | 保留自研（无依赖、已做 XSS 转义），样式融入 PrimeVue 语境 |

### 3.3 交易状态机的 UI 表达

后端状态机：**买家下单 → 卖家确认 → 买家确认完成 / 取消**

前端用三层可视化表达（`src/util.js` 集中定义）：

```js
export const ORDER_STEPS = [
  { label: '买家下单' },
  { label: '卖家确认' },
  { label: '买家确认完成' },
];
export function orderStepIndex(status) { /* 待卖家确认→1, 待完成→2, 已完成→3, 已取消→-1 */ }
export function orderTimeline(status) { /* 返回 3 段带 done 标记的时间线 */ }
```

1. **商品详情页**：`Steps`（只读）展示完整状态机 + 有序列表解释每一步
2. **订单页顶部**：`Steps` 总览，`activeStep` 取当前订单集合中「最靠后」的状态
3. **订单页每行**：`Timeline` 纵向展示该单的三段进度（已完成段用红点标记）
4. **状态文字**：`Tag` 配色映射 —— 已完成 `success` / 待卖家确认 `warn` / 待完成 `info` / 已取消 `danger`

### 3.4 保留的功能

- ✅ **AI 智能上架**：`/ai/item-desc`（发布页生成描述）、`/ai/item-copy`（AI 润色组件生成标题 + 3 卖点）
- ✅ **个性化推荐**：`/ai/recommend?limit=4`（基于收藏分类相似度），Home 顶部「AI 为你推荐」区块保留
- ✅ **Markdown 描述渲染与预览**（PublishWizard / ItemDrawer）
- ✅ **Admin ECharts 四图**：成交额趋势（折线）、类目成交占比（环形饼）、类目成交量（柱状）、Top 活跃卖家（横向条形），数据全部来自 `/admin/stats`
- ✅ **登录态**：`hm_token` / `hm_user` localStorage key 未改动
- ✅ **路由守卫**：`meta.auth` / `meta.admin` 逻辑与路由 path 未改动
- ✅ **服务端分页**：Home 的 `page` / `pageSize` 查询参数语义不变，`Paginator` 事件映射回原 `pagination` 结构

---

## 3.5 形态改造（第二批次）：从「电商后台」到「逛集市」

> 第一批完成的是**换皮**（配色、圆角、组件外观）。第二批次改的是**骨**：
> 布局范式、导航模型、主交互。目标是「一眼可辨」——不再与其它四套共用同一副骨架。

### 改造前后的形态对照

| 维度 | 改造前（第一批） | 改造后（第二批次） |
|------|-----------------|-------------------|
| 首页 | 卡片**等高等宽**网格 + `Paginator` 翻页 | **瀑布流**（CSS `columns`，不等高）+ 滚动到底**自动加载** |
| 商品详情 | 独立页 `/item/:id`（左图右栏两列） | **右侧抽屉**，点击卡片滑出，**可连续浏览** |
| 发布 | 独立页 `/publish` 单屏表单 | **全屏向导**，5 步 + 步骤指示器 |
| 消息 | 独立页 `/chat`（左会话列表 + 右对话） | **右下角浮层聊天窗**，可最小化为气泡 |
| 导航 | 顶部导航含「发闲置 / 消息」**链接** | 「发闲置 / 消息」改为**按钮**（打开浮层），导航只留页面级入口 |

### 3.5.1 瀑布流集市（Home.vue）

- **实现**：CSS multi-column（`.masonry { column-count: 4 }`），卡片 `break-inside: avoid`
- **不等高**：卡片按 `index % 5` 循环套用 5 档缩略图高度（150 / 180 / 195 / 210 / 240px），
  形成小红书店式的错落节奏，而不是整齐矩阵
- **无限滚动**：`IntersectionObserver` 监听底部哨兵元素（`rootMargin: 400px` 预加载），
  触底后以 `page + 1` 追加数据；无 `IntersectionObserver` 时降级为 `scroll` 事件兜底
- **分页语义未变**：仍是后端 `page` / `pageSize` 服务端分页（`PAGE_SIZE = 20`），
  只是把「翻页器」换成「追加」。`Paginator` 组件已从首页移除
- **筛选区重构**：搜索框 + 分类**胶囊行**（含分类 emoji）+ 价格区间，全部收进黑色集市头部条

### 3.5.2 抽屉式详情（components/ItemDrawer.vue）

- **触发**：集市卡片、收藏卡片、我的发布行、订单商品名 —— 全部调用 `openItem(id, list)`
- **连续浏览**：`openItem` 接收当前已加载**列表**作为浏览批次，抽屉头部提供
  `↑ 2/20 ↓` 上下切换与序号显示；抽屉内还有「同一批集市 · 接着逛」小卡网格，可直接跳转
- **内容完整性**：主图 + 多图缩略、状态/成色 `Tag`、爆裂价签、**下单 / 收藏 / 聊一聊**三动作、
  卖家卡、Markdown 描述、`Steps` 交易状态机 —— 与改造前的详情页功能等价
- **交互细节**：`Teleport` 到 body；遮罩点击关闭；`Esc` 关闭；打开时锁定 body 滚动；
  进出场为 `translateX(100%) → 0` 滑入
- **/item/:id 仍可达**：`path` 未改动。直链进入时 `ItemDetail.vue` 立即 `openItem(id)`
  并 `router.replace('/')`，避免「抽屉 + 页面」双份详情

### 3.5.3 全屏发布向导（components/PublishWizard.vue）

五步流程，顶部**步骤指示器**（可点击回退到已完成的步骤）：

| 步骤 | 内容 | 校验 |
|------|------|------|
| 1 基本信息 | 标题、分类、图片 URL | 标题必填 |
| 2 价格成色 | 价格、成色 + **快捷定价**胶囊（¥9/29/59/99/199） | 价格必填 |
| 3 AI 生成描述 | 卖点关键词 → `/ai/item-desc`；并嵌入 `AIPolish` 组件（`/ai/item-copy` 标题+3卖点） | — |
| 4 预览确认 | 左侧缩略图 + 右侧「买家看到的卡片」实时预览 + 清单摘要 | — |
| 5 发布 | `POST /items` → 成功态（再发一件 / 去看看） | — |

- 底部固定操作条：上一步 / 第 N / 5 步 / 下一步或发布
- **/publish 仍可达**：`path` 未改动，`Publish.vue` 挂载即 `openPublish('item')` 并回到集市
- 导航栏「发闲置」按钮：未登录时先跳 `/login`（`redirect=/publish`），已登录直接开向导

### 3.5.4 浮层聊天窗（components/ChatDock.vue + ChatPanel.vue）

- **形态**：右下角客服式窗口，`position: fixed`；`min(760px, 92vw) × min(480px, 74vh)`
- **最小化**：头部 `—` 收起为**红色气泡**（带未读数角标）；`×` 完全关闭
- **窄布局**：`compact` 模式下会话列表与对话线程**互斥显示**，对话头部有 `‹` 返回列表
- **组件复用**：`ChatPanel.vue` 同时服务浮层窗与 `/chat` 页面，会话/消息逻辑只写一份
- **/chat 与 /chat/:convId 仍可达**：页面内嵌同一个 `ChatPanel`，并提供「以浮层窗打开」按钮
- **未读同步**：`ChatPanel` 通过 `unread` 事件上报，写入 `ui.chatUnread`，
  顶部导航「消息」按钮与浮层气泡共享该计数

### 3.5.5 新增的浮层状态层（src/ui.js）

`ui` reactive 对象集中管理四类浮层，避免 prop 层层透传：

```js
ui.drawerOpen / drawerItemId / drawerList / drawerIndex   // 抽屉
ui.publishOpen / publishMode                              // 发布向导
ui.chatOpen / chatMin / chatConvId / chatUnread           // 浮层聊天
```

导出动作：`openItem(id, list)` / `closeItem()` / `stepItem(delta)` /
`openPublish(mode)` / `openChatDock(convId)` / `closeChatDock()` / `toggleChatMin()`

三个浮层组件统一在 `App.vue` 挂载一次，全局可用。

### 3.5.6 与改造前相比删除/退场的部分

| 项目 | 处置 |
|------|------|
| `components/PublishModal.vue` | **删除**（发布改为全屏向导，无引用） |
| `components/AuthModal.vue` | **删除**（登录走 `/login` 页面，从未被挂载） |
| `ui.js` 的 `openAuth/closeAuth/authTab` | **删除**（同上） |
| `ui.js` 的 `openEdit/editOpen/editItemId` | **删除**（编辑页 `/item/:id/edit` 独立可达，保留） |
| 首页 `Paginator` | **移除**（改为无限滚动） |
| `router.js` 中 `/publish` 的 `auth: true` | **保留**（守卫逻辑未动，向导本身也做未登录拦截） |

---

## 4. 与其它四个项目的差异点

五个项目共用同一套业务骨架，本次改造刻意让它们「一眼可辨」：

| 项目 | 组件库 | 视觉方向 | 与 HiveMarket 的差异 |
|------|--------|---------|---------------------|
| mindcare | Mantine 8 | 柔和治愈 · 呼吸感 | HiveMarket 是**高对比硬边**，mindcare 是**低对比柔光 + 大圆角**；HiveMarket 方角 0px，mindcare `radius: 'lg'` |
| edupulse | Ant Design 6 | 赛博霓虹数据驾驶舱 | HiveMarket 是**浅色纸感 + 纯黑**，edupulse 是**深色 + 青蓝/品红辉光**；两者仪表盘都保留 ECharts，但 HiveMarket 的图表容器是白底黑边卡片 |
| scholarboard | Naive UI 2 | 编辑排版极简 · 纸感 | 两者都偏纸感，但 HiveMarket 用**红黑撞色 + 硬阴影 + 旋转**表达粗野，scholarboard 用**衬线大标题 + 充足留白 + 珊瑚橙**表达克制 |
| **hivemarket** | **PrimeVue 4** | **粗野主义电商** | **本项目**：3px 黑边 + `5px 5px 0` 硬阴影 + 顶部滚动 ticker + `#e63946`/`#111111` 撞色 |
| examprep | Shoelace + Open Props | 复古终端 CRT | HiveMarket 是**纸质海报拼贴**，examprep 是**荧光屏扫描线**；HiveMarket 有电商卡片网格，examprep 是等宽终端布局 |

**HiveMarket 的独家识别特征**（其它四个项目都没有）：

1. 顶部**无限滚动公告条**（黄字黑底、等宽字体）
2. **硬阴影 + 位移**的物理按压交互（按钮 hover 位移 2px）
3. 元素**旋转**（价签 -3deg、导航激活项 -1deg、Dialog -0.6deg）
4. **爆裂价签**式的价格展示（黄底黑边 + 硬阴影 + 旋转）
5. 卡片底部**虚线票根**分隔

---

## 5. 文件结构

```
frontend/
├── index.html
├── package.json          # 新增 primevue / @primeuix/themes / primeicons
├── vite.config.js        # 未改动（端口 5174，/api → 4104）
└── src/
    ├── main.js           # ★ PrimeVue + preset + Toast/Confirm 服务 + 中文 locale
    ├── theme.js          # ★ 新增：definePreset(Aura, …) 粗野主义 token
    ├── styles.css        # ★ 改造：设计令牌层 + PrimeVue 粗野化覆盖 + 保留装饰类
    ├── App.vue           # ★ Toast / ConfirmDialog 挂载，导航用 Avatar + Button
    ├── api.js            # 未改动
    ├── router.js         # 未改动（path 与守卫完全一致）
    ├── store.js          # 未改动
    ├── ui.js             # ★ 改造：浮层状态层（抽屉/向导/浮层聊天）
    ├── util.js           # ★ 新增：状态机映射（ORDER_STEPS / orderStepIndex / orderTimeline / Tag severity）
    ├── components/
    │   ├── Modal.vue         # ★ PrimeVue Dialog 外壳（仍服务 AIPolish 预览）
    │   ├── ItemDrawer.vue    # ☆ 新增：右侧抽屉式详情（连续浏览/下单/收藏/聊一聊）
    │   ├── PublishWizard.vue # ☆ 新增：全屏 5 步发布向导
    │   ├── ChatPanel.vue     # ☆ 新增：聊天主体（浮层窗与 /chat 页共用）
    │   ├── ChatDock.vue      # ☆ 新增：右下角浮层聊天窗（可最小化为气泡）
    │   ├── AIPolish.vue      # ★ PrimeVue 表单 + Dialog 预览（接入向导第 3 步）
    │   └── Markdown.vue      # 保留自研渲染器（样式微调）
    └── views/               # 页面全部用 PrimeVue 重做外壳
        ├── Home.vue          # ☆ 瀑布流集市 + 无限滚动（Paginator 已移除）
        ├── ItemDetail.vue    # ☆ 直链 /item/:id → 唤起抽屉并回集市
        ├── Publish.vue       # ☆ 直链 /publish → 唤起全屏向导并回集市
        ├── Chat.vue          # ☆ 内嵌 ChatPanel（/chat 仍可达）
        ├── Edit.vue  Wants.vue  Orders.vue  Favorites.vue
        ├── Mine.vue  Admin.vue  Login.vue  Register.vue
        └── Forbidden.vue  NotFound.vue
```

---

## 6. 不可变项核对

| 约束 | 结果 |
|------|------|
| `backend/` 任何文件 | 未改动 |
| API 路径 / 方法 / 字段名 | **逐条比对备份，23 条路径完全一致** |
| `vue-router` 的 `path` | **`router.js` 与备份逐字节相同（14 条 path 全部未改）** |
| localStorage key 名称 | `hm_token` / `hm_user` 未改动（与备份逐行一致） |
| API 路径 / 方法 / 字段名 | **26 条路径字符串与备份完全一致**（第二批次改形态后复检） |
| Admin 仪表盘四图数据来源 | 全部来自 `/admin/stats`，字段与图表代码未改 |
| AI 智能上架 / AI 推荐 | `/ai/item-desc`、`/ai/item-copy`、`/ai/recommend` 逻辑与调用点保留 |
| 交易状态机 | 后端状态机与 `util.js` 映射未改；`Steps` 在抽屉详情与订单页保留 |
| `vite.config.js` 的 `server.port` 与 `proxy` | 未改动（5174 → 4104） |
| `npm run build` | ✅ 零错误通过（第二批次改造后复验） |

---

## 7. 构建输出（关键行）

```
dist/assets/Home-B1hUWxMW.css                   6.17 kB │ gzip:   1.47 kB
dist/assets/index-CuJeOM6z.css                 48.21 kB │ gzip:   9.61 kB
dist/assets/Home-C591OY3i.js                    6.63 kB │ gzip:   2.88 kB
dist/assets/Orders-DhE23sX9.js                 11.62 kB │ gzip:   3.62 kB
dist/assets/index-Bb6rhNOV.js                 274.31 kB │ gzip:  56.21 kB
dist/assets/index-CVcGy_gF.js                 636.69 kB │ gzip: 160.15 kB
dist/assets/Admin-pdjQvZbD.js               1,039.86 kB │ gzip: 344.99 kB
✓ built in 6.00s
```

> 唯一提示：Admin 分块 > 500 kB（ECharts 全量引入所致，改造前即如此，非本次引入）。
> 第二批次新增的浮层三件套（ItemDrawer / PublishWizard / ChatDock）由 `App.vue` 静态引入，
> 打进主 chunk；`/item/:id`、`/publish`、`/chat` 三个路由页体积反而缩小（0.89~0.97 kB）。

---

## 8. 第二批次验收自检

| 验收项 | 结果 |
|------|------|
| 布局范式与改造方案一致（瀑布流 + 抽屉 + 向导 + 浮层聊天） | ✅ |
| 主交互按方案实现（滚动加载 / 连续浏览 / 分步向导 / 最小化气泡） | ✅ |
| 后端接口零改动 | ✅ `backend/` 无任何写操作 |
| localStorage key 零改动 | ✅ 与备份逐行一致 |
| `npm run build` 零错误 | ✅ |
| 与原版对比布局一眼不同 | ✅ 顶部导航 + 等宽网格 → 黑色集市条 + 瀑布流 |
| 保留粗野主义签名元素 | ✅ 3px 黑边 / 5px 硬阴影 / 红黑撞色 / 顶部滚动 ticker / 元素旋转 |
