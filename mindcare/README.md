# MindCare · AI 心理健康陪护系统

面向学生的全栈 Web 系统：**情绪日志 + 心理测评(SDS) + AI 情感陪护对话 + 语音冥想引导 + 咨询师预约 + 危机预警 + 科普资源库 + AI 情绪周报 + 管理后台数据驾驶舱**。

## 技术栈
- 后端：Python Flask + SQLite + JWT（轻量，不用重型框架）
- 前端：React 18 + Vite 5 + Mantine 8 + ECharts
- 视觉：Apple 设计语言基底（`src/apple-tokens.css`），主题色 `--pink` `#FF2D55`
- AI：兼容 OpenAI 接口的云端大模型（对话 / 情绪洞察 / 周报 / 问卷生成），未配置 Key 时自动降级本地规则；Web Speech 语音合成用于冥想引导与朗读

## 角色
| 角色 | 账号 | 能力 |
| --- | --- | --- |
| 管理员 | `admin / admin123` | 全部功能 + 数据驾驶舱 + 危机预警 + 预约全局管理 |
| 普通用户 | `xiaolan / xiaolan123` | 情绪/测评/冥想/陪护/预约/资源/周报 |
| 咨询师 | `counselor1 / counselor123` | 处理分配给自己的预约 + 危机预警 |

## 功能

### 基础
- **账号系统**：注册 / 登录 / 退出，三种角色
- **情绪日记**：每日记录心情评分与情绪标签，形成趋势；自定义标签（含内置标签体系）
- **心理测评**：Zung 抑郁量表(SDS) 20 题自评，返回标准分与水平分级；**逐题作答落库**，可回看答题明细
- **冥想放松**：选择时长，语音引导 + 呼吸动画 + 全屏沉浸计时，自动记录
- **AI 陪护对话**：倾诉、情感回应，可朗读回复（🔊）
- **自建问卷**：AI 生成或手写问卷，提交后按得分比例自动评级

### 新增业务模块
1. **咨询师预约**（状态机）
   咨询师列表（擅长领域 / 时段 / 评分 / 评分人数）→ 选时段预约 → 状态流转：
   ```
   pending（待确认）
     → confirmed（咨询师已确认）
     → completed（已完成，可评价）
     ↘ cancelled（用户/咨询师/管理员可取消）
   ```
   - 权限分离：`confirmed` / `completed` 仅咨询师与管理员可推进；`cancelled` 三方均可
   - 非法流转返回 **400**，跨用户操作返回 **403**
   - 已完成可评价（1-5 星 + 文字），评价均值回写咨询师评分
   - 同一咨询师同一时段不可重复预约

2. **危机预警**（自动触发）
   - **测评得分中度及以上** → 自动生成 `crisis_alerts`
   - **情绪连续 3 天 ≤ 3 分** → 自动生成 `crisis_alerts`（同日不重复）
   - 咨询师 / 管理员可见，处理方式：**联系本人 / 转介 / 解除预警**（非解除必须填写处理记录，重复处理返回 400）
   - 普通用户仅能看到「自己有一条待关注记录」的提示，不暴露预警详情

3. **心理科普资源库**
   - 18 篇分类文章（情绪管理 / 人际 / 学业压力 / 自我成长）
   - 支持分类筛选、全文搜索、**收藏**（可切换）、**阅读进度**（25/50/75/100%）

4. **AI 情绪周报**（AI 落库闭环）
   - 聚合近 7 天情绪记录 → 云端大模型生成（无 Key 降级本地规则）
   - **写入 `resources` 表的私人报告区**（`kind='weekly_report'`，`user_id` 归属本人）
   - 首页读取并展示摘要，资源库「我的周报」可查看全文
   - 私人报告按用户隔离，他人不可见

### 管理后台
注册用户 / 情绪趋势 / 情绪分布 / 测评水平 / 每日活跃 / **待处理预警** / **预约统计** / **咨询师排行** / **资源库内容量** / 风险预警名单。

## 数据表（14 张）

| 表 | 说明 |
| --- | --- |
| `users` | 账号（admin / user / counselor 三种角色） |
| `mood_entries` | 情绪记录（评分 1-10 + 情绪标签 + 备注） |
| `mood_tags` | 情绪标签（内置 + 自定义，含颜色 / emoji / 分类） |
| `assessments` | SDS 测评记录（总分 + 水平分级） |
| `assessment_answers` | **测评逐题作答**（题目 + 选项分值） |
| `chat_history` | AI 陪护对话记录 |
| `meditation_sessions` | 冥想练习记录（时长） |
| `user_prefs` | 用户偏好（内置标签 seed 标记、收藏、阅读进度） |
| `quizzes` | 自建问卷（题干与分值 JSON） |
| `quiz_submissions` | 问卷提交记录 |
| `counselors` | **咨询师档案**（擅长领域 / 排班时段 / 评分） |
| `appointments` | **预约**（状态机 + 评价） |
| `crisis_alerts` | **危机预警**（触发来源 / 等级 / 处理记录） |
| `resources` | **科普资源 + AI 周报**（`user_id` 为空 = 公共文章） |

## 快速开始

### 后端
```bash
cd backend
python -m venv venv
# Windows: .\venv\Scripts\activate   |  mac/linux: source venv/bin/activate
pip install -r requirements.txt
python app.py          # 监听 4101
```
首次启动自动建表并播种：
- 3 个账号（见上方角色表）
- 8 位咨询师、20 条预约（各状态）、15 条危机预警、20 篇资源（18 科普 + 2 周报）
- 30 条情绪记录（跨 14 天）、10 次测评（含 200 条逐题作答）

### 前端
```bash
cd frontend
npm install
npm run dev            # http://localhost:5173 （已代理 /api 到后端 4101）
```
构建产物：`npm run build`。产物可由后端 4101 单端口托管（SPA 深链可达）。

### 测试
```bash
cd backend
python -m pytest tests/ -q     # 42 passed
```
覆盖：注册登录、重复用户名、密码长度、错误密码、未登录 401、越权 403、情绪 CRUD 与归属、测评分级、AI 本地降级、后台分页搜索、标签 CRUD 与长度限制、自建问卷流程与归属；**预约创建/时段冲突/排班校验、状态机全流程、非法流转 400、终态锁定、跨用户 403、角色可见性、状态筛选与搜索、分页边界**；**危机预警自动触发、角色守卫、处理流程与重复处理 400、筛选校验**；**资源分页/分类/搜索、收藏切换、阅读进度、私人报告隔离**；**AI 周报本地降级落库**；**首页聚合、后台新增模块统计、角色标签**。

## 可选：接入云端大模型
复制 `backend/.env.example` 为 `backend/.env`，填入：
```
LLM_API_KEY=你的key
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
```
配置后对话 / 洞察 / 周报 / 问卷生成走大模型；不配置用内置本地规则（离线可用，响应带 `source` 字段标明来源）。

## 目录结构
```
mindcare/
├─ backend/   Flask + SQLite + 认证 + AI 接口
│   ├─ app.py    路由与业务逻辑
│   ├─ seed.py   种子数据（账号/咨询师/预约/预警/资源）
│   └─ tests/    pytest 用例
├─ frontend/  React + Vite + Mantine
│   └─ src/
│       ├─ apple-tokens.css  Apple 设计令牌层
│       ├─ theme.js          JS 侧令牌与 Mantine 主题
│       ├─ styles.css        App 形态样式（卡片流 / Tab 栏）
│       ├─ components/       EChart / Markdown / Modal / Reveal / States（五态）
│       └─ pages/            登录 / 首页 / 情绪 / 测评 / 冥想 / 陪护 /
│                            咨询师 / 我的预约 / 危机预警 / 资源库 / 周报 / 后台
├─ DESIGN.md  设计文档（含 Apple 改造章节）
└─ README.md
```

## 设计说明
前端已统一到 **Apple 设计语言基底**：主题色 `--pink`、Apple 字体栈、34px 大标题、无边框卡片 + 极浅阴影、深色模式自动切换。
差异化维度保留 **底部 Tab 栏 + 卡片流**（十套系统里最像 iOS App 的一套）。
详见 `DESIGN.md` 第八章「Apple 改造」。

> 注意：`SECRET_KEY`、`LLM_API_KEY` 等敏感信息通过 `backend/.env` 配置，不写入源码。
