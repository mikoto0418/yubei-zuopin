# 十套系统功能规格（深化版）

> 目标：每套系统都做到「**业务闭环完整 · 状态机真实 · AI 回写业务 · 数据有厚度**」。
> 所有前端统一遵守 `APPLE_DESIGN_SYSTEM.md`，不再使用霓虹/终端/粗野主义风格。
> 每套**至少 7 张表**，至少一条**真实状态机**，至少一个**AI 结果落库并驱动后续流程**的功能。

---

## 〇、验收硬门槛（十套通用）

| 维度 | 要求 |
|---|---|
| 数据表 | ≥ 7 张，含关联表与日志表 |
| 状态机 | ≥ 1 条，状态流转有后端校验（非法流转返回 400） |
| CRUD | 每个实体列表支持分页 + 搜索 + 筛选；写接口有参数校验 |
| 权限 | 至少 3 种角色（如 admin / 业务角色A / 业务角色B），越权返回 403 |
| AI | ≥ 3 个功能点，**其中至少一个把结果写入业务表**并在后续流程中被消费 |
| 种子数据 | ≥ 3 个账号、每张主表 ≥ 15 条、跨 ≥ 7 个日期，仪表盘图表有真实内容 |
| 测试 | 后端 ≥ 18 个用例，覆盖状态机非法流转、越权、分页边界、AI 降级 |
| 前端状态 | 每页有加载 / 空 / 错误 / 无权限 / 404 五态 |
| 深色模式 | 可用，无闪烁 |

---

## 一、第一批（保留领域 · 补深 + 换 Apple 皮肤）

### 1.1 MindCare · AI 心理健康陪护（4101 · Flask + React + Mantine 8）

**主题色** `--pink`　**差异化维度**：底部 Tab 栏 + 卡片流（最像 iOS App）

**表（12 张）**
`users` `mood_entries` `mood_tags` `assessments` `assessment_answers` `chat_sessions` `chat_messages` `meditation_sessions` `counselors` `appointments` `crisis_alerts` `resources`

**新增业务模块**
1. **咨询师预约**：咨询师列表（擅长领域/时段/评分）→ 选时段预约 → 状态机 `pending → confirmed → completed / cancelled` → 咨询后可评价
2. **危机预警**：测评得分进入"中度及以上"或情绪连续 3 天 ≤3 分 → 自动生成 `crisis_alerts` → 咨询师端可见 → 处理记录（联系/转介/解除）
3. **心理科普资源库**：分类文章（情绪管理/人际/学业压力），支持收藏与阅读进度
4. **AI 周报**：每周一自动生成情绪周报，**落库到 `resources` 的私人报告区**，App 首页展示

**状态机**：预约 `pending → confirmed → completed / cancelled`（咨询师确认权限、用户取消权限分离）

**AI 落库**：情绪周报写入数据库，首页读取并展示，形成"数据 → AI → 展示"闭环

---

### 1.2 ScholarBoard · 学生智能工作台（4102 · Express + Vue 3 + Naive UI）

**主题色** `--orange`　**差异化维度**：⌘K 命令面板 + 三栏工作区

**表（11 张）**
`users` `projects` `notes` `note_versions` `tags` `note_tags` `resumes` `resume_experiences` `tasks` `attachments` `activities`

**新增业务模块**
1. **项目分组**：笔记/任务归属到项目，项目有颜色与归档态
2. **笔记版本历史**：每次保存生成快照，可对比与回滚（保留最近 20 版）
3. **结构化简历**：经历不再是 JSON 字符串，拆成 `resume_experiences`（公司/职位/起止/描述/亮点列表），支持拖拽排序
4. **活动流**：记录用户所有关键操作（创建/编辑/删除/润色），首页时间线展示
5. **标签体系**：多对多，支持按标签筛选与标签云

**状态机**：简历 `draft → polished → final`（润色后可标记定稿，定稿后锁定编辑）

**AI 落库**：简历润色结果写入 `resumes.polished` + 生成 `resume_experiences` 的结构化亮点，可一键应用回原稿

---

### 1.3 EduPulse · AI 学习分析（4103 · Flask + React + Ant Design 6）

**主题色** `--teal`　**差异化维度**：可拖拽 Widget 驾驶舱（布局存 localStorage）

**表（12 张）**
`users` `subjects` `knowledge_points` `notes` `quizzes` `quiz_options` `quiz_records` `wrong_book` `study_sessions` `study_goals` `achievements` `ai_insights`

**新增业务模块**
1. **知识点体系**：题目挂载到知识点，知识点挂载到学科；掌握度按知识点计算
2. **错题本**：答错自动入错题本，支持标记「已掌握」与重做
3. **学习目标**：设定周/月目标（时长/题量/正确率），进度条实时反映
4. **成就系统**：连续打卡、正确率突破、题量里程碑自动解锁徽章
5. **AI 洞察**：分析薄弱知识点 → 生成学习建议 → **写入 `ai_insights`** → 首页展示 + 可点击跳转到对应知识点练习

**状态机**：目标 `active → achieved / expired`（达成时自动解锁成就）

**AI 落库**：薄弱点分析写入 `ai_insights`，驱动首页推荐与练习入口

---

### 1.4 HiveMarket · 校园二手交易（4104 · Express + Vue 3 + PrimeVue 4）

**主题色** `--red`　**差异化维度**：瀑布流 + 详情抽屉 + 浮层聊天

**表（13 张）**
`users` `categories` `items` `item_images` `orders` `order_logs` `favorites` `conversations` `messages` `wants` `reviews` `reports` `notifications`

**新增业务模块**
1. **评价体系**：交易完成后双向评价（买家评卖家 / 卖家评买家），累计信用分
2. **订单日志**：每次状态变更写 `order_logs`，订单详情页展示流转时间轴
3. **举报与审核**：用户可举报商品/用户，管理员审核队列（通过/驳回/封禁）
4. **通知中心**：下单/确认/消息/评价触发通知，顶部铃铛未读角标
5. **结构化分类**：分类树（数码 → 手机 / 电脑），商品挂载到叶子分类

**状态机**：订单 `待确认 → 待发货 → 待收货 → 已完成 / 已取消 / 退款中`（6 状态，含退款分支）

**AI 落库**：AI 生成的商品描述写入 `items.description`，推荐结果基于收藏行为实时计算

---

### 1.5 ExamPrep · AI 备考规划（4105 · Express + 原生 JS + Shoelace）

**主题色** `--yellow`　**差异化维度**：时间块日历视图（放弃终端风格）

**表（11 张）**
`users` `subjects` `knowledge_points` `goals` `plans` `plan_blocks` `tasks` `mock_exams` `wrong_questions` `study_materials` `reminders`

**新增业务模块**
1. **时间块日历**：计划按 30 分钟粒度排到日历上，可拖拽调整时段
2. **模考记录**：录入模考成绩与各科得分，生成分数趋势
3. **错题本**：记录错题 + 知识点 + 错因，支持重做与标记掌握
4. **学习资料库**：上传/链接资料，按科目分类，记录阅读进度
5. **提醒系统**：计划开始前提醒，未完成的计划自动提醒补做

**状态机**：计划块 `planned → in_progress → done / skipped`（跳过需填原因）

**AI 落库**：AI 生成的备考计划**拆解为 `plan_blocks` 并写入日历**，直接驱动用户当天视图

---

## 二、第二批 · 深化两套（领域不变，加厚）

### 2.1 CityLens · 城市设施巡检（4202 · Express + Vue 3 + Element Plus）

**主题色** `--green`　**差异化维度**：全屏地图 + 毛玻璃浮层

**表（11 张）**
`users` `districts` `facility_types` `facilities` `inspections` `faults` `work_orders` `work_order_logs` `maintenance_teams` `inspection_routes` `notifications`

**新增业务模块**
1. **工单系统**：故障上报 → 自动生成工单 → 派单到维修班组 → 维修中 → 完成 → 验收 → 关闭（**六状态流转**）
2. **区域管理**：设施归属到行政区/网格，支持按区域统计
3. **设施类型字典**：类型可维护（路灯/垃圾桶/井盖/健身器材），带图标
4. **巡检路线**：预设路线（有序设施点列表），巡检员按路线打卡
5. **工单日志**：每次流转写日志，工单详情展示完整时间轴

**状态机**：工单 `created → assigned → in_progress → resolved → verified → closed`（含退回 `resolved → in_progress`）

**AI 落库**：故障诊断结果写入 `faults.diagnosis` 并**自动创建工单**，形成"上报 → 诊断 → 派单"闭环

---

### 2.2 InterviewGo · AI 模拟面试（4203 · Express + React + MUI v7）

**主题色** `--purple`　**差异化维度**：对话流 + 气泡节奏

**表（11 张）**
`users` `job_positions` `question_categories` `question_bank` `interview_sessions` `interview_rounds` `messages` `reports` `skill_assessments` `practice_plans` `answer_analyses`

**新增业务模块**
1. **岗位库**：预设岗位（前端/后端/算法/产品），每个岗位有技能标签与考察维度
2. **题库**：题目按岗位 + 分类（技术/行为/情景）组织，支持自建题
3. **多轮面试**：每轮独立评分（技术准确度/表达清晰度/深度），轮次结束生成阶段小结
4. **技能雷达**：报告拆成多维度评分写入 `skill_assessments`，生成雷达图
5. **弱项练习计划**：根据低分维度**自动生成 `practice_plans`**（推荐题目 + 建议时长），用户可执行并记录进度
6. **答案分析**：每轮回答后 AI 给出要点命中/遗漏分析，写入 `answer_analyses`

**状态机**：会话 `created → in_progress → completed → evaluated`（evaluated 后可生成练习计划）

**AI 落库**：评分写入 `skill_assessments` → 驱动 `practice_plans` 生成 → 用户执行 → 回写进度

---

## 三、第二批 · 重开三套（全新领域）

### 3.1 KitchenFlow · 餐厅后厨订单系统（4201 · Express + React + shadcn/Tailwind）

**主题色** `--orange`　**差异化维度**：高密度卡片 + 倒计时压力

**定位**：面向餐厅后厨的实时订单流转与档口协作系统。

**表（11 张）**
`users` `restaurants` `dining_tables` `menu_categories` `menu_items` `orders` `order_items` `order_status_logs` `kitchen_stations` `station_tasks` `staff_shifts`

**角色**：`admin`（店长）/ `waiter`（服务员，下单）/ `chef`（厨师，接单制作）

**核心流程（状态机，7 状态）**
```
pending（已下单）
  → accepted（后厨已接单）
  → cooking（制作中）
  → ready（已出餐）
  → served（已上菜）
  → paid（已结账）
  ↘ cancelled（取消，仅 pending/accepted 可取消）
```

**功能模块**
1. **桌台管理**：桌位状态（空闲/占用/待清台），点餐绑定桌位
2. **菜单管理**：分类 + 菜品（价格/图片/做法/预计制作时长/所属档口）
3. **下单**：服务员选桌 → 加菜 → 提交（支持备注：少辣/免葱）
4. **后厨看板**：按档口分列（热菜/凉菜/主食/饮品），卡片显示**剩余时间进度环**，超时卡片橙色描边脉冲
5. **档口任务**：订单自动拆解为 `station_tasks` 分发到各档口，各档口独立标记完成
6. **出餐叫号**：ready 后推送通知给服务员
7. **结账**：支持整单结账与拆单结账
8. **班次管理**：员工排班，统计各班次订单量与出品效率

**AI 功能（3 个，含落库）**
- **销量预测**：根据历史订单预测次日各菜品需求量 → 写入 `menu_items.predicted_demand`
- **备料建议**：按预测生成备料清单
- **异常识别**：识别长时间未接单/超时未出餐的订单并告警

**差异化实现**：卡片比其他 App 小一号（圆角 `--radius-md`），倒计时进度环用 SVG，超时脉冲是唯一允许的循环动画

---

### 3.2 ScriptForge · 剧本/小说创作工作台（4204 · Express + Vue 3 + Arco Design）

**主题色** `--indigo`　**差异化维度**：纸张质感 + 衬线正文

**定位**：影视剧本与长篇小说的创作工具，核心是**角色关系 + 场景结构 + 对白编辑**。

**表（12 张）**
`users` `projects`（作品）`episodes`（分集/章节）`scenes`（场景）`characters`（角色）`character_relations`（角色关系）`dialogues`（对白）`storylines`（故事线）`storyline_scenes`（故事线-场景关联）`notes`（创作笔记）`revisions`（版本快照）

**角色**：`admin` / `writer`（编剧，写自己的作品）/ `editor`（责编，可审阅所有作品）

**核心流程（状态机）**
```
作品：draft（草稿）→ reviewing（送审）→ revising（返修）→ approved（过审）→ archived
场景：outline（大纲）→ drafted（初稿）→ revised（修订）→ final（定稿）
```

**功能模块**
1. **作品管理**：多部作品，每部有类型（电影/网剧/小说）、题材、简介、状态
2. **分集/章节**：作品下的结构单元，可拖拽排序
3. **场景编辑器**：场景 = 地点 + 时间 + 出场角色 + 正文；正文用**衬线字体 + 米色纸背景**
4. **角色管理**：角色卡（姓名/年龄/身份/性格/目标/弧光），支持头像
5. **角色关系图**：可视化关系网络（父子/恋人/敌对/师徒），SVG 绘制
6. **对白编辑**：结构化的「角色 + 台词 + 情绪提示」，可导出标准剧本格式
7. **故事线**：A/B/C 故事线，每条线关联若干场景，检查故事线完整性
8. **版本快照**：场景保存生成版本，可对比与回滚
9. **创作笔记**：灵感、设定、参考资料

**AI 功能（4 个，含落库）**
- **角色设定生成**：根据身份描述生成完整角色卡 → **写入 `characters`**
- **对白润色**：选中台词润色，保留角色语气
- **情节建议**：基于当前故事线给出冲突/转折建议
- **逻辑检查**：检查场景间的时间/地点/角色出场矛盾 → **写入 `notes` 作为待办**

**差异化实现**：编辑器区域米色纸 `#FBF9F6`，正文衬线 17px 行高 1.8；界面元素仍用无衬线

---

### 3.3 LogiTrack · 物流运单跟踪平台（4205 · Express + React + Chakra UI v3）

**主题色** `--blue`　**差异化维度**：时间轴 + 地图联动

**定位**：快递/物流运单的全链路跟踪与异常处理平台。

**表（12 张）**
`users` `customers`（寄/收件人）`warehouses`（网点）`vehicles`（车辆）`drivers`（司机）`waybills`（运单）`packages`（包裹明细）`route_nodes`（路线节点/中转记录）`scan_records`（扫描记录）`exceptions`（异常件）`notifications`

**角色**：`admin`（总部）/ `dispatcher`（调度员）/ `courier`（快递员）

**核心流程（状态机，8 状态）**
```
created（已下单）
  → picked_up（已揽收）
  → in_transit（运输中）
  → arrived_hub（到达分拨）
  → out_for_delivery（派送中）
  → delivered（已签收）
  ↘ exception（异常：拒收/破损/地址错误/超时）
  ↘ returned（退回）
```

**功能模块**
1. **运单创建**：寄件人 + 收件人 + 包裹信息（重量/体积/物品类型/保价）
2. **运单查询**：按运单号/手机号/收件人查询，展示**物流时间轴**
3. **节点扫描**：每个中转节点扫码记录（网点 + 时间 + 操作员 + 状态）
4. **地图联动**：时间轴节点与地图标记**双向高亮**（点节点→地图定位，点标记→时间轴滚动）
5. **车辆与司机**：车辆档案 + 司机分配 + 当前任务
6. **异常处理**：异常件登记 → 处理（改址/退回/理赔）→ 关闭
7. **时效预测**：根据历史数据预测到达时间
8. **通知**：状态变更推送短信/站内信（模拟）

**AI 功能（3 个，含落库）**
- **时效预测**：预测送达时间 → **写入 `waybills.estimated_delivery`**，前端展示
- **异常识别**：识别长时间无扫描记录的运单并告警 → **创建 `exceptions`**
- **路线优化**：为派送员规划当日最优派送顺序

**差异化实现**：中轴时间轴（节点按状态着色），运输中节点带流动虚线动画；地图与时间轴联动是核心交互

---

## 四、实施顺序

| 阶段 | 内容 | 说明 |
|---|---|---|
| 1 | 三套重开（KitchenFlow / ScriptForge / LogiTrack） | 从零建，直接按深化标准做 |
| 2 | 两套深化（CityLens / InterviewGo） | 在现有基础上加表加流程 |
| 3 | 五套 Apple 皮肤改造（含前五套 + 深化两套 + 重开三套统一） | 前端统一到 Apple 基底 |
| 4 | 全量验收 | 十套跑 verify + smoke |

**注意**：前五套（MindCare/ScholarBoard/EduPulse/HiveMarket/ExamPrep）的**领域与表结构保留并补深**，但**前端要从当前风格（霓虹/终端/粗野）改成 Apple 基底**，这一项工作量大，需单独排期。

---

## 五、通用约定（不变）

- 端口：4101-4105（第一批）/ 4201-4205（第二批）
- 响应结构：`{code, data, message}`，成功 `code=0`
- 鉴权：JWT，`Authorization: Bearer <token>`
- AI：OpenAI 兼容，未配置 Key 自动降级本地规则，响应带 `source`
- 密码：bcrypt，管理员统一 `admin/admin123`
