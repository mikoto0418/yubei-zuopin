# 新五套前端实现规范

> 本文档与 `forms/README.md`（形态规格）、`projects/<key>.config.mjs`（项目实体与 AI）
> 共同构成前端实现的唯一依据。**API 契约部分不得改动**。

---

## 0. 必读顺序

1. `_pipeline/forms/README.md` —— 你负责的**形态**的交互规格（布局/导航/主交互/动效）
2. `_pipeline/projects/<你的key>.config.mjs` —— 该项目的**实体字段、AI 路由、演示账号**
3. 本文件 —— 通用约定与 API 契约

---

## 1. 技术约定

- 前端位于 `<key>/frontend/`，React 18 或 Vue 3 + Vite（按 config 的 `frontend` 字段）
- 组件库按 config 的 `ui` 字段，**必须真实使用**，不能只装不用
- 路由：`react-router-dom` v6 / `vue-router` v4
- 状态：Context / composable 即可，不引入 Redux/Pinia 之外的重量级方案
- 纯 JavaScript，**不引入 TypeScript**
- 源码 UTF-8 无 BOM，界面文案**全中文**

---

## 2. API 契约（严格照此）

Base：`/api`（开发时 Vite 代理到后端；生产同源）

**统一响应结构**：
- 成功 `{ "code": 0, "data": <内容>, "message": "ok" }`
- 失败 `{ "code": <HTTP状态码>, "data": null, "message": "中文错误说明" }`

### 2.1 认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/register` | body `{username, password, ...扩展字段}` |
| POST | `/api/auth/login` | body `{username, password}` |
| GET | `/api/auth/me` | 需 token，返回当前用户 |
| PUT | `/api/auth/me` | 需 token，body `{nickname?, avatar?, ...扩展}` |

登录/注册成功返回：`{code:0, data:{token:"<JWT>", user:{...}}}`

### 2.2 实体 CRUD

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/entities/<table>` | 查询参数：`page`、`pageSize`、`q`、各 filterable 字段、`all=1`（仅管理员，看全部） |
| GET | `/api/entities/<table>/:id` | 单条 |
| POST | `/api/entities/<table>` | 创建，返回 **201** + 新记录 |
| PUT | `/api/entities/<table>/:id` | 更新，返回更新后记录 |
| DELETE | `/api/entities/<table>/:id` | 返回 `{code:0, data:{id}}` |

列表返回：`{code:0, data:{list:[...], total:<n>, page:<n>, pageSize:<n>, pages:<n>}}`

> 注意：`user_id` 由后端从 JWT 注入、`created_at` 由数据库生成，**提交时不要带上**。
> 各表可写字段见 config 的 `columns`（排除 `user_id`/`created_at`）。

### 2.3 Admin（需 admin 角色）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/admin/overview` | `{users:<n>, <表名>_total:<n>, ...}` |
| GET | `/api/admin/users` | 用户数组（不含密码） |

### 2.4 AI

`POST /api/ai/<path>`（需 token），body 视功能而定，返回：
`{code:0, data:{text:"<结果文本>", source:"llm"|"local"}}`

`source` 为 `local` 表示走了本地规则降级（未配 API Key），前端应正常展示，可标注来源。

---

## 3. 鉴权与登录态

- localStorage 存两个键：`<前缀>_token`（字符串）、`<前缀>_user`（JSON）
- 前缀见 §6 速查表
- 请求统一封装 `api.js`：自动带 `Authorization: Bearer <token>`
- **401**：清除登录态 → 跳登录页
- **403**：渲染"无权限访问"页，不要静默失败
- 路由守卫：未登录访问受保护页面 → 重定向登录页

---

## 4. 页面必备状态（评审硬性要求）

- 每个列表：**加载态**（骨架屏或 spinner）、**空态**（引导文案 + 行动按钮）、**错误态**（含重试）
- 每个表单：前端校验 + 后端 message 回显
- 必须有：登录页、注册（可合并）、404 页、403 页
- 列表要有分页或无限滚动
- 表单要能新增、编辑、删除（完整 CRUD）

---

## 5. 构建与验证（交付门槛）

```bash
cd <key>/frontend && npm install && npm run build   # 必须零错误
cd <key>/backend && npm start                        # 后端能起
```

用 `admin / admin123` 登录后，主流程必须能走通（列表 → 新增 → 编辑 → 删除 → AI 功能）。

---

## 6. 各项目速查表

| key | 后端端口 | vite 端口 | 形态 | 组件库 | 框架 | token 前缀 |
| --- | --- | --- | --- | --- | --- | --- |
| flowboard | 4201 | 5201 | board（看板） | shadcn/ui + Tailwind | React | `fb` |
| citylens | 4202 | 5202 | map（地图） | Element Plus | Vue | `cl` |
| interviewgo | 4203 | 5203 | chat（对话流） | MUI | React | `ig` |
| inkwell | 4204 | 5204 | editor（编辑器） | Arco Design | Vue | `iw` |
| chronicle | 4205 | 5205 | timeline（时间轴） | Chakra UI | React | `ch` |

**Vite 配置**：`server.port` 用上表 vite 端口，`server.proxy` 把 `/api` 指向该项目的后端端口。

---

## 7. 组件库安装（版本已确认可用）

```bash
# flowboard (React)
npm i tailwindcss @tailwindcss/vite class-variance-authority clsx tailwind-merge lucide-react @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-select @radix-ui/react-tabs @dnd-kit/core @dnd-kit/sortable

# citylens (Vue)
npm i element-plus @element-plus/icons-vue leaflet

# interviewgo (React)
npm i @mui/material @emotion/react @emotion/styled @mui/icons-material

# inkwell (Vue)
npm i @arco-design/web-vue

# chronicle (React)
npm i @chakra-ui/react @emotion/react @emotion/styled framer-motion
```

> shadcn/ui 不是 npm 包，是「复制组件源码到项目」的模式。本项目按 shadcn 的**设计语言**（Tailwind + Radix + cva 变体）自行实现组件即可，无需 CLI 初始化。

---

## 8. 自查清单

- [ ] 布局范式与 `forms/README.md` 中该形态的规格一致（不是通用「侧边栏+列表+弹窗」模板）
- [ ] 主交互按规格实现（拖拽 / 地图点选 / 流式对话 / 所见即所得 / 时间轴）
- [ ] 组件库真实使用（能从 DOM class 或组件标签看出来）
- [ ] 加载态 / 空态 / 错误态齐全
- [ ] 登录 / 登出 / 403 / 404 完整
- [ ] 列表有分页或无限滚动
- [ ] CRUD 完整可用
- [ ] AI 功能可调用并展示结果
- [ ] `npm run build` 零错误
- [ ] 与其它四套并排看，**布局一眼不同**
