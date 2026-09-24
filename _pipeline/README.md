# 作品流水线（Batch Pipeline）

> 用于批量产出"功能完整 · 可部署 · 可测试 · 形态各异"的全栈作品级系统。
> 设计原则：**内核统一保正确，形态分家做差异，领域独立出亮点。**

---

## 一、为什么是三层

前十套系统的教训：如果只换 CSS 和组件库，五个项目拆开看仍是同一套东西——
登录 → 侧边栏 → 列表页 → 弹窗表单 → Admin 仪表盘。评委同时开两个，第二眼就看穿了。

所以差异化必须**下沉到产品形态**：布局范式、导航模型、主交互方式。这三样不同，
才是"两个不同的产品"，而不是"同一个产品的两套皮肤"。

| 层 | 职责 | 是否复用 | 变化方式 |
| --- | --- | --- | --- |
| **L1 内核 kernel** | 鉴权/RBAC、DB、统一响应、分页、错误处理、seed、测试、部署脚本 | ✅ 完全复用 | 逐字节相同 |
| **L2 形态 form** | 布局范式、导航模型、主交互、组件库、设计令牌、动效语言 | ❌ 每套不同 | 由 `form` 预设决定 |
| **L3 领域 domain** | 实体建模、业务路由、页面、AI 功能 | ❌ 每套不同 | 由 `entities` / `ai` 声明 |

**L1 复用不是偷懒，是保证质量。** 这部分要的是"正确"，不是"不同"——
JWT 签名、RBAC 拦截、分页边界、SQL 注入防护、统一错误结构，每一套都自己写一遍只会引入 bug。
把它冻结成内核，所有产出共享同一份经过验证的实现。

**L2/L3 不复用才是重点。** 差异要体现在用户看得见、点得到的地方。

---

## 二、五种产品形态

每个形态定义了**一套完整的交互范式**，不是换个布局那么简单。

| 形态 | 布局范式 | 导航模型 | 主交互 | 适合的领域 |
| --- | --- | --- | --- | --- |
| `board` | 多列泳道 | 顶栏项目切换 | 拖拽卡片跨列流转 | 任务/缺陷/流水线/审批 |
| `map` | 地图铺底 + 侧滑面板 | 地图上的标记点 | 点选标记 → 侧滑详情 | 空间/位置/巡检/资源分布 |
| `chat` | 全屏对话 + 会话列表 | 左侧会话列表 | 流式对话、消息内嵌卡片 | 陪练/助手/客服/协作 |
| `editor` | 编辑器主体 + 大纲侧栏 | 文档树 | 富文本所见即所得 | 写作/知识库/文档/笔记 |
| `timeline` | 纵向时间轴 | 时间刻度跳转 | 滚动回溯、事件展开 | 日志/编年/里程碑/成长档案 |

形态与组件库**正交**：同一个 `board` 形态可以用 shadcn 实现，也可以用 Element Plus 实现。

---

## 三、配置驱动

一个系统的全部差异由一份 `project.config.mjs` 声明：

```js
export default {
  key: 'flowboard',          // 目录名
  name: 'FlowBoard',         // 显示名
  tagline: '敏捷项目协作',
  port: 4201,                // 全局唯一
  backend: 'node',           // node | flask
  frontend: 'react',         // react | vue
  form: 'board',             // board | map | chat | editor | timeline
  ui: 'shadcn',              // 见 §四
  entities: [ ... ],         // 领域实体
  ai: { ... },               // AI 功能
  accounts: { ... },         // 演示账号
}
```

`node scaffold.mjs <config>` 据此生成完整项目骨架，然后由领域实现填充。

---

## 四、组件库分配（十套互不重复）

| 批次 | 系统 | 形态 | 前端 | 组件库 |
| --- | --- | --- | --- | --- |
| 一 | MindCare | 卡片流 | React | Mantine 8 |
| 一 | ScholarBoard | 编辑器优先 | Vue | Naive UI 2 |
| 一 | EduPulse | 驾驶舱网格 | React | Ant Design 6 |
| 一 | HiveMarket | 集市网格 | Vue | PrimeVue 4 |
| 一 | ExamPrep | 终端 | 原生 | Shoelace 2 |
| 二 | FlowBoard | 看板 | React | **shadcn/ui** |
| 二 | CityLens | 地图 | Vue | **Element Plus** |
| 二 | InterviewGo | 对话流 | React | **MUI** |
| 二 | Inkwell | 编辑器 | Vue | **Arco Design** |
| 二 | Chronicle | 时间轴 | React | **Chakra UI** |

十套十个库，无重复。

---

## 五、目录

```
_pipeline/
├── README.md              本文件（流水线说明）
├── OVERVIEW.md            十套交付索引（一览表 / 差异表 / 账号 / 启动）
├── FRONTEND_SPEC.md       API 契约与前端约定
├── BATCH1_REWORK.md       第一批五套的形态改造方案
├── scaffold.mjs           生成器：读 config → 写出完整项目骨架
│                          （后端内核 + 领域路由 + 配置 + 启动脚本 + 测试）
├── kernel/node/           Node 内核（Express + better-sqlite3 + JWT + AI 降级）
│   ├── index.js           内核统一出口
│   ├── src/               http / auth / db / ai / crud / admin / server
│   └── test/core.test.js  内核测试套件（各项目复用）
├── forms/README.md        五种产品形态的交互规格（说明文档，非可执行骨架）
├── projects/              五个系统的 config（flowboard/citylens/interviewgo/inkwell/chronicle）
├── verify-all.sh          十套统一验收：后端测试 + 前端构建 + 接口冒烟
└── smoke-frontend.sh      十套前端页面托管冒烟：首页 HTML + 资源可达 + SPA 深链
```

> 说明：`forms/` 与 `projects/*.config.mjs` 记录的是**设计规格与配置**，生成器据此产出项目；
> 前端页面本身由各项目的领域实现填充，不存在通用可执行的前端骨架目录。
> 第二批五套的后端完全由 `kernel/node` + config 生成；第一批五套（Flask/Express 混合、原生前端）
> 是改造前既有的独立实现，只做了前端形态改造，未纳入生成器。

---

## 六、验证

三层验证，全部为真实 HTTP 请求 / 真实构建，不依赖 mock：

```bash
# 1) 单套：后端测试 → 前端构建 → 起服务 → 核心接口冒烟 → 关进程
cd <project> && bash verify.sh

# 2) 十套统一验收（后端测试 + 前端构建 + 401 拦截 + 管理员登录）
bash _pipeline/verify-all.sh

# 3) 十套前端页面托管冒烟（首页 HTML + 本地资源可达 + SPA 深链回退）
bash _pipeline/smoke-frontend.sh
```

内核自带的 `test/core.test.js` 覆盖：注册 → 登录 → 鉴权 → 403 拦截 → CRUD → 分页 → AI 降级。
各项目在此之上追加领域用例（AI 路由、业务状态机、所有权隔离等）。

---

## 七、使用

```bash
# 生成一个新项目
node _pipeline/scaffold.mjs _pipeline/projects/flowboard.config.mjs

# 进入项目
cd flowboard

# 装依赖、初始化数据、启动
bash start.sh

# 验证（构建 + 接口冒烟）
bash verify.sh
```
