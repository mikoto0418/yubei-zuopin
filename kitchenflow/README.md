# KitchenFlow · 餐厅后厨订单系统

面向餐厅后厨的实时订单流转与档口协作系统。三个角色（店长 / 服务员 / 厨师）驱动一条订单从下单到结账的完整生命周期，订单自动拆解到档口，档口协作反向推动出餐。

---

## 1. 简介

KitchenFlow 解决的是一间餐厅里最日常也最容易乱的问题：**一桌客人点了八个菜，分布在四个档口，谁先做、谁在做、哪单快超时了？**

系统把这个问题拆成三层：

- **前台层**（服务员）：开台、点餐、上菜、结账
- **后厨层**（厨师）：按档口看自己的待做列表，只关心自己档口的那几道菜
- **经营层**（店长）：订单趋势、档口效率、AI 销量预测与异常告警

三者共用同一套订单数据，但各自看到的界面完全不同。

---

## 2. 功能

### 核心业务

| 模块 | 功能 |
|---|---|
| **后厨看板** | 按 4 个档口分列；订单卡带 SVG 倒计时进度环；超时卡片橙色描边脉冲；20 秒自动刷新（可暂停）；点击卡片推进「待制作 → 制作中 → 已完成」 |
| **桌台管理** | 12 张桌位网格；空闲 / 占用 / 待清台三态用颜色区分；空闲桌可直接去点餐；待清台一键清台 |
| **点餐** | 选桌（占用桌自动禁用）→ 按分类浏览菜单 → 加入购物车 → 逐项备注（少辣/免葱）→ 整单备注 → 提交 |
| **菜单管理** | 分类 + 菜品 CRUD；菜品字段含价格 / 图片 URL / 做法 / 预计制作时长 / 所属档口 |
| **订单列表** | 分页 + 状态筛选 + 桌号筛选 + 订单号搜索；详情抽屉含菜品明细、档口任务、**状态流转时间轴**、按角色渲染的可执行动作 |
| **结账** | 待结账（已上菜）订单列表；选支付方式整单结账；结账后桌台自动转待清台 |
| **班次管理** | 按日期分组的排班表；各班次订单量与营业额统计；店长可增删排班、一键今日全部值班 |
| **店长概览** | 6 张统计卡 + 内联 SVG 订单趋势图 + 档口效率排行（按平均出品耗时）+ AI 异常告警 |
| **个人中心** | 资料编辑、我的排班、角色权限说明 |

### AI 功能（3 个）

| 功能 | 接口 | 说明 |
|---|---|---|
| **销量预测** | `POST /api/ai/forecast-demand` | 按近 7 天销量预测次日需求，**结果写入 `menu_items.predicted_demand`** |
| **备料清单** | `POST /api/ai/prep-list` | 读取预测结果，按档口分组生成备料清单（含主料换算） |
| **异常识别** | `POST /api/ai/detect-anomaly` | 识别超时未接单 / 未开火 / 未出餐 / 未上菜订单，返回告警列表 |

**闭环设计**：销量预测把结果写进数据库，备料清单读同一个字段。菜单管理页会在菜品卡上显示「预测 N」标签，形成「历史数据 → AI 预测 → 落库 → 展示 → 消费」的完整链条。

### 状态机（7 状态）

```
pending → accepted → cooking → ready → served → paid
pending/accepted ↘ cancelled
```

后端强校验：非法流转返回 **400**，角色越权返回 **403**，终态（paid / cancelled）不可再流转。

---

## 3. 技术栈

**后端**
- Node.js + Express 4
- better-sqlite3（同步 API，WAL 模式，`foreign_keys = ON`）
- jsonwebtoken（JWT 鉴权）+ bcryptjs（密码哈希）
- 复用 `_pipeline/kernel/node` 内核：统一响应体、鉴权中间件、通用 CRUD 路由工厂、AI 降级骨架

**前端**
- React 18 + Vite 5
- React Router 6
- Tailwind CSS v4（`@tailwindcss/vite`）
- Radix UI 原语 + shadcn 设计语言
- lucide-react 图标
- Apple 设计语言基底（`apple-tokens.css` 令牌层）

**测试**
- Node.js 内置 `node:test`，无额外测试依赖

---

## 4. 目录结构

```
kitchenflow/
├── backend/
│   ├── ai/                        # 三个 AI 功能实现
│   │   ├── forecast-demand.js     # 销量预测（写库）
│   │   ├── prep-list.js           # 备料清单（读预测）
│   │   └── detect-anomaly.js      # 异常识别
│   ├── data/                      # SQLite 数据库文件（运行时生成）
│   ├── src/                       # 内核副本（从 _pipeline 复制）
│   │   ├── ai.js                  # LLM 调用 + 本地降级
│   │   ├── auth.js                # JWT + RBAC
│   │   ├── crud.js                # 通用 CRUD 路由工厂
│   │   ├── db.js                  # SQLite 封装
│   │   ├── http.js                # 统一响应 + 分页
│   │   ├── server.js              # Express 应用工厂
│   │   └── routes/orders.js       # 订单专属路由（状态机 + 档口任务）
│   ├── test/
│   │   ├── core.test.js           # 内核通用套件（可复用）
│   │   ├── core.app.test.js       # 内核套件执行入口
│   │   └── app.test.js            # KitchenFlow 业务测试
│   ├── db.js                      # 11 张表建表 + 索引 + 种子
│   ├── kernel.js                  # 内核统一出口
│   ├── overview.js                # Admin 概览业务指标
│   ├── routes.js                  # 路由装配
│   ├── seed.js                    # 独立种子脚本
│   └── server.js                  # 服务入口（端口 4201）
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/AppShell.jsx      # 侧边导航 + 内容区
│   │   │   ├── ui/primitives.jsx        # 按钮/输入/抽屉/弹窗等
│   │   │   ├── ui/states.jsx            # 五态组件
│   │   │   ├── CountdownRing.jsx        # SVG 倒计时进度环
│   │   │   ├── StatusBadge.jsx          # 通用状态徽章
│   │   │   └── RouteGuards.jsx          # 鉴权 + 角色守卫
│   │   ├── context/AuthContext.jsx      # 鉴权上下文（401 自动登出）
│   │   ├── lib/
│   │   │   ├── api.js                   # API 封装（kf_token / kf_user）
│   │   │   ├── constants.js             # 状态机镜像 + 领域常量
│   │   │   └── utils.js                 # cn()
│   │   ├── pages/                       # 11 个页面
│   │   ├── apple-tokens.css             # Apple 设计令牌（共享层）
│   │   ├── index.css                    # 主题覆盖 + 项目样式
│   │   ├── App.jsx                      # 路由表
│   │   └── main.jsx                     # 入口
│   ├── index.html
│   └── vite.config.js                   # 开发端口 5201，代理到 4201
├── DESIGN.md                      # 设计说明
├── README.md                      # 本文件
├── .env / .env.example            # 环境变量
├── start.sh / start.bat           # 一键启动
└── verify.sh                      # 验证脚本
```

---

## 5. 启动

### 方式一：一键启动（推荐）

```bash
# macOS / Linux
./start.sh

# Windows
start.bat
```

脚本会依次：安装依赖 → 构建前端 → 初始化数据库 → 启动服务（端口 4201）。

### 方式二：开发模式（前后端分离）

```bash
# 终端 1：后端（4201）
cd backend
npm install
npm run seed
npm start

# 终端 2：前端热更新（5201，/api 代理到 4201）
cd frontend
npm install
npm run dev
```

打开 http://localhost:5201 即可。

### 方式三：生产单端口

```bash
cd frontend && npm run build && cd ..
cd backend && npm start
```

后端会自动托管 `frontend/dist`，访问 http://localhost:4201 即可（SPA 路由兜底已配置）。

---

## 6. 演示账号

| 用户名 | 密码 | 角色 | 能做什么 |
|---|---|---|---|
| `admin` | `admin123` | 店长 | 全部功能 + 经营概览 + AI 销量预测 + 排班管理 |
| `waiter1` | `waiter123` | 服务员 | 点餐、上菜、结账、桌台管理 |
| `chef1` | `chef123` | 厨师 | 后厨看板、档口任务、菜单维护、备料清单 |

登录页提供「演示账号一键填充」，点击即可填入。

> 注册接口也支持选择角色（admin / waiter / chef），传入非法角色会回落为 waiter。

---

## 7. 测试

```bash
cd backend
npm test
```

当前 **43 个用例全部通过**，覆盖：

| 类别 | 用例 |
|---|---|
| 种子数据厚度 | 桌台 ≥12、菜品 ≥25、订单 ≥40、趋势跨 ≥7 天、班次跨 ≥7 天 |
| 认证 | 注册返回 token、重复用户名 409、弱密码 400、错误密码 401、未登录 401 |
| 越权 | waiter 访问 admin 概览 403、waiter 调用写库 AI 403、角色回落 |
| 状态机 | `pending→cooking` 400、`pending→paid` 400、未知状态 400、waiter 接单 403、全链路 6 步、cancelled 后不可流转 |
| 档口任务 | 接单前无任务、接单后自动生成、全部完成自动出餐、非法状态 400 |
| 订单 | 下单成功（订单号/明细/日志）、缺明细 400、菜品不存在 400、桌台占用绑定 |
| 看板与筛选 | 看板 4 列、按状态筛选、按档口筛选 |
| 分页边界 | pageSize 夹到 100、page=0 纠正为 1、超末页返回空但总数正确 |
| AI 降级 | 三个接口 source=local、预测值写入 `predicted_demand`、未登录 401 |
| 通用 CRUD | 菜品增改删、缺必填 400、员工列表不含密码 |

### 完整验证

```bash
./verify.sh
```

依次执行：后端测试 → 前端构建 → 接口冒烟（`GET /api/auth/me` 期望 401）。

---

## 8. AI 配置

默认**不需要任何配置**——三个 AI 接口在未配置 Key 时自动降级为本地规则引擎，响应体带 `source: "local"`。

要接入真实大模型，在 `backend/.env` 中配置：

```bash
LLM_API_KEY=sk-xxxxxxxxxxxx
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
LLM_TIMEOUT=20000
```

任何 OpenAI 兼容接口都可以（含各类中转/自建服务）。配置后响应 `source` 变为 `"llm"`。

**本地规则引擎不是空壳**：
- 预测：近 7 天日均销量 × 1.1 安全系数，向上取整
- 备料：25 道菜的主料换算表（如宫保鸡丁 → 鸡腿肉 0.25kg / 花生米 0.05kg）
- 异常：分阶段阈值（待接单 5 分钟 / 未开火 8 分钟 / 制作 20 分钟 / 未上菜 8 分钟）+ 档口积压检测

大模型调用失败会自动降级并打印警告，接口不会 500。

---

## 9. 配置项

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `4201` | 后端服务端口 |
| `JWT_SECRET` | 进程级随机 | JWT 签名密钥。**不配置则重启后登录态失效**，生产必须配置 |
| `TOKEN_TTL` | `7d` | Token 有效期 |
| `DB_PATH` | `backend/data/kitchenflow.db` | SQLite 文件路径 |
| `LLM_API_KEY` | 空 | 不配置则 AI 全部走本地规则 |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI 兼容接口地址 |
| `LLM_MODEL` | `gpt-4o-mini` | 模型名 |
| `LLM_TIMEOUT` | `20000` | LLM 请求超时（毫秒） |

前端 localStorage 键：`kf_token`（JWT）、`kf_user`（用户信息）。API 层在收到 401 时自动清除并跳转登录页。

---

## 10. 设计文档

完整设计说明见 **[DESIGN.md](./DESIGN.md)**，包含：

- 形态说明与三个支点
- 11 张表的 ER 关系与字段设计理由
- 状态机定义、校验点、每个流转的副作用
- AI 落库闭环的数据流图
- 前端 Apple 基底遵守情况 + 差异化维度详解
- 与其它九套系统的横向差异对比
- 已知取舍

设计规范依据：
- `_pipeline/FUNCTIONAL_SPEC.md` §3.1 KitchenFlow
- `_pipeline/APPLE_DESIGN_SYSTEM.md`（Apple 设计语言基底）

---

## 11. 截图占位

> 运行 `./start.sh` 后访问 http://localhost:4201，按下表路径截图补充。

| 页面 | 路径 | 建议截图内容 |
|---|---|---|
| 登录页 | `/login` | 左侧品牌区 + 演示账号一键填充 |
| 店长概览 | `/admin` | 6 张统计卡 + 订单趋势折线图 + 档口效率排行 |
| **后厨看板** | `/kitchen` | 4 档口分列 + 倒计时进度环 + 超时橙色脉冲卡 |
| 桌台管理 | `/tables` | 12 桌位网格，三色状态区分 |
| 点餐页 | `/order/new` | 左侧菜单分类浏览 + 右侧购物车 |
| 菜单管理 | `/menu` | 菜品卡网格 + 「预测 N」标签 + AI 输出面板 |
| 订单列表 | `/orders` | 表格 + 筛选条 + 详情抽屉（状态流转时间轴） |
| 结账页 | `/checkout` | 待结账订单卡 + 结账弹窗 |
| 班次管理 | `/shifts` | 按日期分组的排班表 |
| 个人中心 | `/profile` | 资料表单 + 我的排班 + 权限说明 |
| 404 | `/not-exist` | 居中错误卡片 |

```
[截图 1：登录页]
[截图 2：店长概览]
[截图 3：后厨看板（核心页）]
[截图 4：订单详情抽屉]
[截图 5：点餐页]
[截图 6：菜单管理 + AI 预测]
```
