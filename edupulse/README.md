# EduPulse · AI 学习分析助手

> 前后端分离的 Web 全栈项目：**AI 数字人虚拟教师 + 学习数据驾驶舱**。
> Apple 设计语言基底，主题色 `--teal`；差异化维度是**可拖拽 Widget 驾驶舱**（首页布局自定义，存 localStorage）。

---

## 一、功能总览

| 模块 | 说明 |
| --- | --- |
| 👤 账号系统 | 注册 / 登录 / 退出，`user` 与 `admin` 两种角色，JWT 令牌认证，密码哈希存储；注册默认普通用户（管理员由 seed 创建） |
| 🧭 **知识点体系** | 6 学科 / 40 知识点 / 60 题；题目挂到知识点、知识点挂到学科；掌握度按知识点正确率计算，分档「已掌握 / 较熟练 / 待巩固 / 薄弱」 |
| 📕 **错题本** | 答错自动入本，累计错误次数；支持就地重做、标记「已掌握」、移除；重做答对即自动转「已掌握」（状态机 `pending → mastered`） |
| 🎯 **学习目标** | 周/月目标（学习时长 / 答题数量 / 正确率），进度依据真实学习数据实时统计；状态机 `active → achieved / expired`（非法流转返回 400） |
| 🏆 **成就系统** | 12 枚徽章：连续打卡（3/7/14 天）、题量里程碑（10/50/100/200 题）、正确率突破（60/75/90%）、学习时长（300/1000 分钟）自动解锁，未解锁显示进度 |
| 💡 **AI 洞察** | 分析薄弱知识点 → **写入 `ai_insights` 表** → 首页与洞察页展示 → 一键跳转对应知识点专项练习（AI 结果驱动后续流程的闭环） |
| ✎ 学习笔记 + AI 知识梳理 | 记录标题 / 正文 / 来源科目 / 易错点，支持搜索、科目筛选、分页；一键调用 AI 提炼要点、提取易错点、给出学习建议 |
| ✓ 题库练习 | 按知识点抽题作答，后端自动判定对错并记录；**卡片翻页式**一题一屏（滑切 / ← → / 圆点跳转）；支持 `?knowledge_point_id=xx` 直达专项练习 |
| ⌛ 学习记录 | 录入各科学习时长，按科目/日期筛选、分页；统计各科时长、每日时长、学习天数、连续打卡 |
| ▼ 管理仪表盘（仅 admin） | 概览卡 + 4 张 ECharts：各科时长分布饼图、知识点掌握度雷达、正确率趋势、每日时长柱状图，以及用户活跃度排行 |
| ☺ 个人中心 | 学习时长汇总、正确率汇总、知识点掌握度概览 |
| 🎓 AI 数字人虚拟教师 | Canvas 手绘拟人化头像（眨眼 / 瞳孔跟踪 / 张嘴说话 / 思考扩散动画）；语音 + 文字提问，打字机效果回答，中文语音朗读 |

**AI 引擎说明**：配置了 `LLM_API_KEY` 就调用兼容 OpenAI 的 Chat Completions 大模型（响应标注 `source=llm`）；未配置则自动降级为本地的规则引擎（`source=local`），系统始终可运行、可演示。

---

## 二、技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Python **Flask** · REST API · **SQLite**（flask-sqlalchemy）· JWT（flask-jwt-extended）· werkzeug 密码哈希 |
| 前端 | **React 18** + **Vite 5** · React Router · **Ant Design 6** · **ECharts** 数据可视化 |
| 测试 | **pytest**（32 个接口级用例） |
| AI | OpenAI 兼容接口（可选）· 浏览器 **Web Speech API**（语音识别）+ **SpeechSynthesis**（中文朗读） |

> 明确**不使用** Django。

---

## 三、目录结构

```
edupulse/
├── backend/                    # Flask 后端（端口 4103）
│   ├── app.py                  # 应用入口 / 11 个蓝图注册 / 全局异常 / SPA 托管
│   ├── config.py               # 配置（读 .env）
│   ├── response.py             # 统一响应 {code, data, message}
│   ├── models.py               # 12 张表 + 状态机常量 + 成就定义
│   ├── services.py             # 业务服务层：掌握度 / 错题本 / 目标状态机 / 成就 / 洞察
│   ├── ai_service.py           # AI：答疑 + 笔记梳理 + 出题 + 薄弱点分析（含本地降级）
│   ├── seed.py                 # 全量种子数据（幂等，支持 --fresh）
│   ├── requirements.txt
│   ├── pytest.ini
│   ├── .env.example
│   ├── routes/                 # 11 个蓝图
│   │   ├── auth_routes.py      #   认证
│   │   ├── note_routes.py      #   笔记
│   │   ├── quiz_routes.py      #   题库（含错题本联动）
│   │   ├── session_routes.py   #   学习记录
│   │   ├── ai_routes.py        #   AI 答疑 / 出题
│   │   ├── admin_routes.py     #   管理仪表盘（RBAC）
│   │   ├── knowledge_routes.py #   知识点 / 掌握度
│   │   ├── wrong_routes.py     #   错题本
│   │   ├── goal_routes.py      #   学习目标（状态机）
│   │   ├── achievement_routes.py # 成就
│   │   └── insight_routes.py   #   AI 洞察
│   └── tests/                  # pytest 接口测试（conftest + 32 用例）
├── frontend/                   # React + Vite 前端（端口 5173，/api 代理到 4103）
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx             # 路由 + 登录守卫 + 403/404
│       ├── api.js              # 请求封装（统一响应解包 / 携带 token）
│       ├── auth.jsx            # 登录状态上下文
│       ├── apple-tokens.css    # Apple 设计令牌层（十套共用）
│       ├── theme.js            # antd Design Token（浅/深色双主题）
│       ├── styles.css          # 布局外壳 / 业务组件 / 深色微调
│       ├── components/         # Layout / WidgetGrid / EChart / DigitalTeacher / TeacherDock / TeacherPanel / Markdown
│       └── pages/              # Home / Knowledge / Practice / WrongBook / Goals / Insights /
│                               # Achievements / Notes / StudyLog / Teacher / Profile / Dashboard / Login
├── DESIGN.md                   # 设计文档
├── start.bat                   # Windows 一键启动
├── start.sh                    # Linux/macOS 一键启动
└── .gitignore
```

---

## 四、安装与启动

> 前置：Python 3.10+、Node 18+。

### 方式一：一键启动

- **Windows**：双击 `start.bat`
- **Linux / macOS**：`bash start.sh`

### 方式二：手动分步

**1. 后端（端口 4103）**

```bash
cd backend
python -m venv ../venv
..\venv\Scripts\pip install -r requirements.txt     # Linux/macOS: ../venv/bin/pip
cp .env.example .env                                # Windows: copy .env.example .env
..\venv\Scripts\python seed.py                      # 初始化数据（--fresh 可重建）
..\venv\Scripts\python app.py                       # 启动，监听 0.0.0.0:4103
```

**2. 前端（端口 5173）**

```bash
cd frontend
npm install
npm run dev                                         # http://localhost:5173
```

> 前端开发服务器已配置代理，所有 `/api/*` 请求自动转发到 4103，无跨域问题。

---

## 五、默认账号

| 角色 | 用户名 | 密码 |
| --- | --- | --- |
| 管理员 | `admin` | `admin123` |
| 演示学员 | `demo` | `demo123` |
| 学员 | `student1` | `student123` |

`seed.py --fresh` 会写入完整种子数据：

| 实体 | 数量 |
| --- | --- |
| 账号 | 3 |
| 学科 | 6 |
| 知识点 | 40 |
| 题目（含结构化选项 240 条） | 60 |
| 笔记 | 20 |
| 答题记录 | 80（跨 14 天） |
| 错题本 | 15（含 pending / mastered 两态） |
| 学习记录 | 30（跨 14 天） |
| 学习目标 | 8（active / achieved / expired 三态齐备） |
| 成就 | 36（每人 12 枚，部分已解锁） |
| AI 洞察 | 10 |

---

## 六、运行测试

后端内置 pytest 接口测试，**32 个用例全部通过**，覆盖：

| # | 覆盖点 |
| --- | --- |
| 1 | 注册 / 登录 / 鉴权（401） |
| 2 | RBAC：普通用户访问 admin 接口 403 |
| 3 | 笔记 CRUD + AI 梳理（含归属隔离 404） |
| 4 | 答题判定 + 知识点挂载 + 参数校验 |
| 5 | 学习记录录入 / 汇总 / 筛选 |
| 6 | AI 保底输出（聊天 / 出题 / 状态 三处降级） |
| 7 | 知识点掌握度（正确率计算 + 分档 + 详情 404） |
| 8 | 错题本联动（自动入本 / 标记掌握 / 重做 / 筛选 / 越权 404） |
| 9 | 学习目标状态机（**非法流转 400** / 未达标不可达成） |
| 10 | 成就自动解锁（题量里程碑 / 连续打卡 / 幂等性） |
| 11 | AI 洞察落库（生成 → 列表可读 → 状态流转 → 无数据降级） |
| 12 | 分页边界（越界收拢 / 超大页码 / 新接口鉴权） |

```bash
cd backend
..\venv\Scripts\python -m pytest tests -v     # Linux/macOS: ../venv/bin/python
```

> 测试使用独立临时数据库，不影响演示数据 `edupulse.db`。

---

## 七、AI Key 配置（可选）

未配置时 AI 使用本地规则引擎，功能正常；**想启用大模型**：

1. `cp backend/.env.example backend/.env`（Windows: `copy backend\.env.example backend\.env`）
2. 编辑 `.env`：

```ini
LLM_BASE_URL=https://api.deepseek.com/v1   # 或 OpenAI: https://api.openai.com/v1
LLM_API_KEY=sk-你的密钥
LLM_MODEL=deepseek-chat                    # 按服务商填写
```

3. 重启后端生效（`LLM_API_KEY` 为空则始终走本地保底）。

> `.env` 已被 `.gitignore` 忽略，切勿提交真实密钥。JWT 密钥同样通过环境变量配置。

---

## 八、核心业务闭环

### 8.1 AI 洞察驱动学习（AI 结果落库 → 消费）

```
答题数据
  → POST /api/insights/analyze
  → 服务端聚合薄弱知识点（正确率升序）
  → 调用大模型 / 本地规则生成洞察
  → 写入 ai_insights 表（含 knowledge_point_id 回填）
  → 首页「AI 洞察」widget + /insights 页展示
  → 点击跳转 /practice?knowledge_point_id=xx 专项练习
  → 新答题数据回流，形成闭环
```

### 8.2 答题触发的连锁反应

一次 `POST /api/quizzes/:id/answer` 会同步完成：

1. 写 `quiz_records`（答题记录）
2. 答错 → 写入 / 更新 `wrong_book`（错题本）；答对且已在错题本 → 标记 `mastered`
3. 重新评估 `achievements`（题量 / 正确率 / 时长里程碑）
4. 影响 `knowledge_points` 掌握度聚合与学科统计

### 8.3 目标状态机

```
active ──(进度达标 / 手动)──→ achieved   ← 终态，自动解锁成就
   └───(截止日期已过 / 放弃)──→ expired   ← 终态
```

- 非法流转（如 `expired → achieved`）返回 **400**
- 标记达成需 `progress >= target`，否则 400（可传 `force` 跳过）
- 进度按周期窗口（本周一~周日 / 本月 1 日~月末）实时计算

---

## 九、数据表结构（12 张）

| # | 表 | 说明 |
| --- | --- | --- |
| 1 | `users` | id, username, password_hash, role, nickname, created_at |
| 2 | `subjects` | id, name, code, color, description, order_index |
| 3 | `knowledge_points` | id, subject_id→subjects, name, code, description, difficulty, order_index |
| 4 | `notes` | id, user_id→users, title, content, subject, mistake, summary, created_at |
| 5 | `quizzes` | id, question, options(JSON 冗余), answer, analysis, tag, difficulty, **subject_id, knowledge_point_id** |
| 6 | `quiz_options` | id, quiz_id→quizzes, idx, content, is_correct（结构化选项，唯一约束 quiz_id+idx） |
| 7 | `quiz_records` | id, user_id, quiz_id, tag, **knowledge_point_id**, is_correct, answer, answered_at |
| 8 | `wrong_book` | id, user_id, quiz_id, knowledge_point_id, wrong_count, correct_count, **status(pending/mastered)**, last_answer, last_wrong_at, mastered_at（唯一约束 user_id+quiz_id） |
| 9 | `study_sessions` | id, user_id, subject, duration(分钟), note, study_date |
| 10 | `study_goals` | id, user_id, title, period(week/month), metric(duration/quiz_count/accuracy), target, progress, **status(active/achieved/expired)**, subject, start_date, end_date, achieved_at |
| 11 | `achievements` | id, user_id, code, title, description, icon, category, threshold, progress, unlocked, unlocked_at（唯一约束 user_id+code） |
| 12 | `ai_insights` | id, user_id, kind(weak_point/advice/trend), title, content, suggestion, knowledge_point_id, subject, severity, status(new/read/resolved), source(llm/local), created_at |

> 统一接口规范：所有接口返回 `{code, data, message}`，成功 `code=0`；详情/删除等操作带登录鉴权与会话隔离；admin 接口额外 RBAC（非管理员 403）。

---

## 十、单端口部署

前后端合并为单端口 4103，可直接访问 `http://localhost:4103`：

```bash
cd frontend && npm install && npm run build && cd ..
cd backend && ..\venv\Scripts\python app.py
```

| 路由 | 行为 |
| --- | --- |
| `GET /` | 有 `frontend/dist/index.html` 返回页面，否则回退 JSON 健康信息 |
| `GET /<path>` | 命中 dist 真实文件直出；否则交回 `index.html`（SPA 深链可达） |
| `GET /api/*`（未匹配） | 保持 JSON 404，不把接口错误伪装成页面 |

开发模式仍可用 Vite 5173 + proxy → 4103，两种方式并存。

---

## 十一、常见问题

- **端口被占用**：后端读 `PORT` 环境变量（默认 4103）；前端改 `frontend/vite.config.js` 的 `port` 与 `proxy.target`（需同步）。
- **语音朗读无声**：`speechSynthesis` 需浏览器支持并加载中文语音包，Chrome / Edge 均可；首次需在点击后触发。
- **语音识别不可用**：仅 Chrome / Edge 支持 `SpeechRecognition`，其他浏览器会提示降级到文字输入。
- **深色模式**：跟随系统自动切换，无需手动设置；`index.html` 已内联首屏底色，切换无白闪。
- **首页布局想恢复默认**：拖拽网格底部「恢复默认布局」按钮，或清除 `localStorage` 的 `edupulse_dashboard_layout`。

---

祝学习愉快！🚀 <br>
*EduPulse · AI 学习分析助手*
