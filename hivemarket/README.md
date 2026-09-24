# 🐝 HiveMarket · 校园二手交易平台

基于「前后端分离」架构的校园二手交易 Web 系统（学生作品，粗野主义 + 电商红黑撞色风格）。从「可运行骨架」升级为**功能完整、可部署、可测试**的作品级系统：内核对齐需求规格，覆盖 商品发布/浏览/搜索/筛选/收藏/浏览计数 → 求购 → 交易状态机 → 站内 IM → 个人中心 → Admin 数据仪表盘 → AI 智能上架与个性化推荐。

## ✨ 功能总览

| 模块 | 说明 |
| --- | --- |
| 账号系统 | 注册 / 登录 / 退出 / 改资料；`user` 与 `admin` 双角色，JWT 鉴权 + RBAC（普通用户访问 Admin 返回 403） |
| 商品 | 发布 / 详情（含浏览计数）/ 编辑 / 下架·重上架；关键词搜索、分类筛选、价格区间筛选、分页；收藏/取消收藏 |
| 求购 | 发布求购帖、删除（带确认）、列表 |
| 交易状态机 | 买家下单 → 卖家确认（商品置「已售」）→ 买家确认完成；支持取消；非法状态流转被拦截 |
| 站内 IM | 就商品开启会话（聊一聊）、会话列表、收发消息、未读红点提示 |
| 个人中心 | 我的发布（下架/编辑入口）、我的订单（我买的/我卖的）、我的收藏 |
| Admin 后台 | 统计卡片 + ECharts 四图：成交额趋势（折线）、类目成交占比（饼）、类目成交量（柱）、Top 活跃卖家（排名） |
| AI | ✍️ AI 智能上架（读标题/分类/关键词）；🎯 为你推荐（基于收藏/下单的分类相似度，非 LLM 亦可跑） |

## 🛠 技术栈

| 端 | 技术 |
| --- | --- |
| 后端 | Node.js (Express) · SQLite（better-sqlite3）· bcryptjs · jsonwebtoken (JWT) |
| 前端 | Vue 3 · Vite · vue-router · ECharts |
| 端口 | 后端 **4104** · 前端开发 **5174**（`/api` 代理到 4104） |

## 📁 目录结构

```
hivemarket/
├─ backend/                  # 后端服务（Express + SQLite）
│  ├─ src/
│  │  ├─ index.js            # 入口：路由 + 统一响应 + 托管前端 dist
│  │  ├─ db.js               # 建表 / 迁移 / 幂等 seed 演示数据
│  │  ├─ middleware/auth.js  # JWT 认证 / admin 权限 / 软认证
│  │  ├─ services/aiService.js  # AI 描述生成(LLM/保底) + 智能推荐
│  │  └─ routes/             # auth/items/wants/orders/favorites/messages/admin/ai
│  ├─ test/core.test.js      # 核心链路测试（node:test，共 9 项）
│  ├─ .env.example           # 环境变量模板（复制为 .env）
│  └─ data/                  # SQLite 文件（首次启动自动生成）
├─ frontend/                 # 前端 Vue3 + Vite
│  ├─ src/views/             # Home/ItemDetail/Edit/Publish/Wants/Orders/Chat/Mine/Favorites/Login/Register/Admin/Forbidden/NotFound
│  └─ dist/                  # 生产构建产物（npm run build 生成）
├─ start.bat                 # Windows 一键启动脚本
├─ .gitignore
└─ README.md
```

## 🚀 一键启动（方式 A，单端口部署，推荐）

Windows 下双击或命令行运行：

```bat
start.bat
```

脚本会自动：安装前后端依赖（已装则跳过）→ 生成 `.env`（缺失时）→ 构建前端 → 启动后端并托管前端构建产物。

打开 **http://localhost:4104** 即可使用完整系统。

## 🚀 手动启动

公共依赖：Node.js ≥ 18。

### 方式 A：生产模式（后端托管前端，单端口）

```bash
# 1. 装依赖
cd backend   && npm install
cd ../frontend && npm install

# 2. 配置环境变量（第一次）
cd ../backend && copy .env.example .env     # Windows
# Linux/macOS:  cp .env.example .env

# 3. 构建前端
cd ../frontend && npm run build

# 4. 启动后端（自动托管 frontend/dist 并初始化数据库）
cd ../backend && npm start
# 打开 http://localhost:4104
```

### 方式 B：开发模式（前后端分离热更新）

```bash
# 终端 1：启动后端
cd backend && npm run dev        # http://localhost:4104

# 终端 2：启动前端（/api 自动代理到 4104）
cd frontend && npm run dev       # http://localhost:5174
```

> 若 4104 被占用，修改 `backend/.env` 的 `PORT` 与 `frontend/vite.config.js` 的代理目标即可（例如 4114）。

## 🧪 运行测试

后端核心链路测试基于 Node 内置 `node:test`，零额外依赖、通过真实 HTTP 请求验证：

```bash
cd backend
npm test
```

覆盖 9 项核心链路：
注册 / 登录 / 重复注册拦截；普通用户访问 Admin **403**、admin 正常取数；商品 发布→详情(浏览计数)→编辑(含非法价格/越权拦截)→下架→列表搜索分页；订单 下单→卖家确认(商品置已售)→买家完成 全流转及非法流转拦截/重复下单拦截/取消；**AI 上架文案未配置 Key 时保底返回（`source=local`）**；求购/收藏/IM/推荐；未知接口 404。

## 🔑 账号

- **管理员**：`admin / admin123`（可进入「管理后台」看仪表盘）
- **普通用户（演示数据）**：`zhangsan / 123456`、`lisi / 123456`、`wangwu / 123456`

> 首次启动会自动写入上述账号与演示商品/求购/订单/会话数据（幂等，已有数据即跳过）。

## ⚙️ AI 接入约定

编辑 `backend/.env`：

```ini
LLM_API_KEY=你的密钥
LLM_BASE_URL=https://api.openai.com/v1   # 兼容 OpenAI 的 base url
LLM_MODEL=gpt-4o-mini
```

- 配置了 `LLM_API_KEY` → 「AI 商品描述」调用真实大模型（OpenAI 兼容 `chat/completions`）。
- **未配置** → 自动降级为本地文案模板，响应带 `source: local` 字段，按钮照常可用、可离线演示。

“为你推荐”为规则算法（基于收藏/下单的分类相似度），不依赖大模型。

## 📸 截图占位

> （可选）在此处插入首页、商品详情、站内 IM、Admin 仪表盘截图。

## ⚠️ 说明与设计取舍

- 图片采用**「分类占位图 + 图片 URL」的经济方案**：不为项目引入文件上传与对象存储，卖家填 URL 即显示配图，留空自动显示该分类图标占位图（前端 `util.js` 的 `iconFor`）。既零依赖又能正常演示。
- 交易为教学演示，未接真实支付：商品不可删除（仅下架），订单通过「正式交易」走校验。
- 数据库为本地 SQLite（`backend/data/hivemarket.db`），删除该文件重启即恢复初始种子数据。
- 站内 IM 为轮询式（打开页面时拉取），未接入 WebSocket/实时推送；足够满足学生作品演示。