// InterviewGo 数据层：11 张表 + 迁移 + 索引 + 幂等种子。
// 表：users / job_positions / question_categories / question_bank / interview_sessions
//     interview_rounds / messages / reports / skill_assessments / practice_plans / answer_analyses
'use strict';
require('dotenv').config();
const path = require('path');
const { openDatabase, addColumn, ensureIndexes } = require('./kernel').db;
const { hashPassword } = require('./kernel').auth;

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'interviewgo.db');
const db = openDatabase(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  nickname TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  target_role TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS job_positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT DEFAULT '技术',
  level TEXT DEFAULT '中级',
  description TEXT DEFAULT '',
  skills TEXT DEFAULT '[]',
  dimensions TEXT DEFAULT '[]',
  is_builtin INTEGER DEFAULT 1,
  user_id INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS question_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT DEFAULT '技术',
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS question_bank (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id INTEGER,
  category_id INTEGER,
  content TEXT NOT NULL,
  reference_answer TEXT DEFAULT '',
  key_points TEXT DEFAULT '[]',
  difficulty TEXT DEFAULT '中等',
  is_builtin INTEGER DEFAULT 1,
  user_id INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (position_id) REFERENCES job_positions(id) ON DELETE SET NULL,
  FOREIGN KEY (category_id) REFERENCES question_categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS interview_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  position_id INTEGER,
  role TEXT DEFAULT '前端工程师',
  level TEXT DEFAULT '初级',
  status TEXT DEFAULT 'created',
  score INTEGER DEFAULT 0,
  round_count INTEGER DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS interview_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  session_id INTEGER NOT NULL,
  round_no INTEGER DEFAULT 1,
  question_id INTEGER,
  question TEXT DEFAULT '',
  answer TEXT DEFAULT '',
  tech_score INTEGER DEFAULT 0,
  clarity_score INTEGER DEFAULT 0,
  depth_score INTEGER DEFAULT 0,
  overall INTEGER DEFAULT 0,
  summary TEXT DEFAULT '',
  status TEXT DEFAULT 'scored',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  session_id INTEGER NOT NULL,
  round_id INTEGER,
  role TEXT DEFAULT 'user',
  content TEXT DEFAULT '',
  card_type TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  session_id INTEGER NOT NULL,
  overall INTEGER DEFAULT 0,
  logic INTEGER DEFAULT 0,
  depth INTEGER DEFAULT 0,
  expression INTEGER DEFAULT 0,
  summary TEXT DEFAULT '',
  suggestions TEXT DEFAULT '',
  source TEXT DEFAULT 'local',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS skill_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  session_id INTEGER NOT NULL,
  report_id INTEGER,
  dimension TEXT NOT NULL,
  dimension_key TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  level TEXT DEFAULT '待提升',
  comment TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS practice_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  session_id INTEGER,
  report_id INTEGER,
  title TEXT NOT NULL,
  dimension TEXT DEFAULT '',
  dimension_key TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  target_questions TEXT DEFAULT '[]',
  suggested_minutes INTEGER DEFAULT 60,
  progress INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  due_date TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS answer_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  session_id INTEGER NOT NULL,
  round_id INTEGER,
  question TEXT DEFAULT '',
  answer TEXT DEFAULT '',
  hit_points TEXT DEFAULT '[]',
  missed_points TEXT DEFAULT '[]',
  score INTEGER DEFAULT 0,
  comment TEXT DEFAULT '',
  source TEXT DEFAULT 'local',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE
);
`);

// 旧库迁移：补新增列，不破坏已有数据。
addColumn(db, 'messages', 'round_id INTEGER');
addColumn(db, 'reports', "source TEXT DEFAULT 'local'");

// 旧版中文状态 → 新状态机取值（旧库升级时一次性归一）
(function migrateStatuses() {
  const map = { 进行中: 'in_progress', 已完成: 'completed', 已取消: 'completed' };
  Object.entries(map).forEach(([from, to]) => {
    try {
      db.prepare('UPDATE interview_sessions SET status = ? WHERE status = ?').run(to, from);
    } catch { /* 表不存在时忽略 */ }
  });
})();

ensureIndexes(db, `
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON interview_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON interview_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_session ON reports(session_id);
CREATE INDEX IF NOT EXISTS idx_rounds_session ON interview_rounds(session_id);
CREATE INDEX IF NOT EXISTS idx_bank_position ON question_bank(position_id);
CREATE INDEX IF NOT EXISTS idx_bank_category ON question_bank(category_id);
CREATE INDEX IF NOT EXISTS idx_skills_session ON skill_assessments(session_id);
CREATE INDEX IF NOT EXISTS idx_plans_user ON practice_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_session ON answer_analyses(session_id);
`);

// —— 状态机定义（后端唯一权威，路由与测试共用）——
const SESSION_STATES = ['created', 'in_progress', 'completed', 'evaluated'];
const SESSION_FLOW = {
  created: ['in_progress'],
  in_progress: ['completed'],
  completed: ['evaluated'],
  evaluated: [],
};
const PLAN_STATES = ['pending', 'in_progress', 'done'];
const PLAN_FLOW = {
  pending: ['in_progress'],
  in_progress: ['done'],
  done: [],
};

function canTransition(flow, from, to) {
  return Boolean(flow[from] && flow[from].includes(to));
}

// 过去第 n 天的本地时间字符串，用于把种子数据摊到多个日期上。
function day(n, h = 10, m = 0) {
  const d = new Date(Date.now() - n * 86400000);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(h)}:${p(m)}:00`;
}

// —— 种子数据定义 ——
const POSITIONS = [
  ['前端工程师', '技术', '中级', '负责 Web 前端架构与体验优化，考察语言基础、框架原理、工程化与性能优化。', ['JavaScript', 'React', 'Vue', 'TypeScript', '构建工具', '性能优化'], ['逻辑性', '专业深度', '表达力', '工程实践']],
  ['后端工程师', '技术', '中级', '负责服务端架构与稳定性，考察数据库、缓存、并发与分布式设计。', ['Java', 'Go', 'MySQL', 'Redis', '分布式', '高并发'], ['逻辑性', '专业深度', '表达力', '系统思维']],
  ['算法工程师', '技术', '高级', '负责模型训练与效果优化，考察数学基础、算法能力与工程落地。', ['Python', '机器学习', '深度学习', '数据结构', '特征工程'], ['逻辑性', '专业深度', '数学基础', '落地能力']],
  ['产品经理', '产品', '中级', '负责需求判断与产品迭代，考察分析框架、数据意识与沟通推进。', ['需求分析', '数据分析', '用户研究', '项目管理', '原型设计'], ['逻辑性', '表达力', '用户视角', '推动力']],
  ['数据分析师', '数据', '中级', '负责指标体系建设与业务洞察，考察 SQL、统计与可视化表达。', ['SQL', 'Python', '统计学', '可视化', '指标体系'], ['逻辑性', '专业深度', '表达力', '业务理解']],
  ['测试开发工程师', '技术', '中级', '负责质量保障体系与自动化建设，考察测试设计、自动化与性能压测。', ['自动化测试', '性能测试', 'CI/CD', '接口测试', '质量体系'], ['逻辑性', '专业深度', '严谨性', '工程实践']],
];

const CATEGORIES = [
  ['JavaScript 基础', '技术', '语言核心、异步模型、原型与作用域'],
  ['框架原理', '技术', 'React / Vue 的运行机制与设计取舍'],
  ['数据库', '技术', '索引、事务、SQL 优化与存储选型'],
  ['算法与数据结构', '技术', '复杂度、常见数据结构与解题思路'],
  ['系统设计', '技术', '高并发、可用性与架构权衡'],
  ['网络与安全', '技术', 'HTTP、TCP、缓存与常见攻击防护'],
  ['自我介绍与动机', '行为', '自我定位、项目概述与求职动机'],
  ['团队协作', '行为', '跨角色配合、冲突处理与推动力'],
  ['职业规划', '行为', '成长路径、学习方式与长期目标'],
  ['线上故障处理', '情景', '故障定位、止损与复盘'],
  ['需求冲突', '情景', '优先级判断与取舍沟通'],
  ['跨部门沟通', '情景', '对齐目标、推进落地'],
];

// [岗位下标, 分类下标, 题干, 参考答案, 关键要点, 难度]
const QUESTIONS = [
  [0, 0, '请解释浏览器的事件循环机制，宏任务与微任务的区别是什么？', '事件循环负责调度同步与异步任务：同步代码在调用栈执行，异步任务分宏任务（setTimeout、I/O）与微任务（Promise.then、MutationObserver）。每执行完一个宏任务，会清空全部微任务队列，再进入下一个宏任务。', ['事件循环', '调用栈', '宏任务', '微任务', 'Promise'], '中等'],
  [0, 1, 'React 的 useEffect 依赖数组为空、不写、写具体值，三种情况分别意味着什么？', '不写依赖表示每次渲染后都执行；空数组表示只在挂载后执行一次、卸载时清理；写具体值表示依赖变化时才执行。清理函数在下次执行前与卸载时调用。', ['每次渲染', '挂载一次', '依赖变化', '清理函数'], '中等'],
  [0, 5, 'HTTP 强缓存与协商缓存的区别是什么，各自对应哪些响应头？', '强缓存直接命中本地副本，不发请求，对应 Cache-Control 的 max-age 与 Expires；协商缓存会发请求让服务端校验，对应 ETag/If-None-Match 与 Last-Modified/If-Modified-Since，命中返回 304。', ['Cache-Control', 'Expires', 'ETag', 'Last-Modified', '304'], '中等'],
  [0, 4, '如何优化一个首屏加载 3 秒的页面？请给出具体手段和预期收益。', '从网络、资源、渲染三方面入手：路由懒加载与代码分割减少首包体积；图片压缩、WebP 与懒加载；开启 gzip/brotli；静态资源上 CDN；关键 CSS 内联、非关键 JS 延迟；服务端渲染或预渲染关键页面。', ['代码分割', '懒加载', 'CDN', '压缩', 'SSR'], '困难'],
  [0, 6, '请用一分钟介绍你自己，重点讲一个你主导的项目。', '按「定位—项目—难点—结果」结构：先说明经验年限与方向，再选一个主导项目，讲清问题、你的方案与量化结果，最后点出与目标岗位的匹配度。', ['定位', '项目背景', '个人贡献', '量化结果'], '简单'],
  [0, 9, '线上页面出现大面积白屏，你如何定位和处理？', '先止损（回滚或降级），再定位：看监控与错误上报确认影响面，比对最近发布记录，用 sourcemap 还原堆栈，排查资源加载失败与运行时异常，修复后补充监控与灰度机制。', ['止损', '影响面', '错误上报', '回滚', '复盘'], '困难'],
  [0, 11, '设计稿与实现效果有差异，设计师要求返工，你如何沟通？', '先对齐标准：把差异具体化为可验证的项（间距、色值、字号、动效），区分必须修复与可接受偏差，说明工期影响并给出替代方案，最后形成走查清单避免反复。', ['对齐标准', '具体化差异', '工期影响', '走查清单'], '中等'],
  [1, 2, '数据库索引为什么能加速查询？什么情况下索引会失效？', '索引把全表扫描变成有序结构的定位查找，B+ 树叶子节点成链适合范围查询。失效场景包括：对索引列做函数或运算、隐式类型转换、以 % 开头的模糊匹配、联合索引不满足最左前缀、区分度太低。', ['B+ 树', '最左前缀', '函数运算', '隐式转换', '区分度'], '中等'],
  [1, 4, '如何设计一个高并发场景下的秒杀系统？', '分层削峰：前端限流与按钮防重、网关层限流与黑名单、库存预热到 Redis 并用 Lua 保证原子扣减、下单请求走 MQ 异步落库、数据库最终扣减并对账补偿，同时做好超卖与幂等控制。', ['限流', 'Redis', '原子扣减', 'MQ 异步', '幂等'], '困难'],
  [1, 3, '如何在 O(n) 时间内找出数组中第 K 大的元素？', '可用快速选择（基于快排分区，平均 O(n)）或维护大小为 K 的小顶堆（O(n log K)）。若数据范围有限，也可用计数或桶排序。关键是说明复杂度与适用场景。', ['快速选择', '小顶堆', '平均复杂度', '适用场景'], '中等'],
  [1, 5, 'Redis 缓存穿透、击穿、雪崩分别是什么，如何应对？', '穿透是查不存在的数据，用布隆过滤器或空值缓存；击穿是热点 key 过期瞬间大量请求，用互斥锁或逻辑过期；雪崩是大批 key 同时失效，用过期时间加随机、多级缓存与熔断降级。', ['布隆过滤器', '空值缓存', '互斥锁', '随机过期', '熔断'], '中等'],
  [1, 7, '你和同事在技术方案上产生分歧，最后怎么解决？', '先回到目标与约束对齐评价标准，用数据或小范围验证代替争论，明确决策责任人与截止时间，保留记录；如果仍无法一致，按负责人决策执行并在复盘时验证效果。', ['对齐目标', '数据验证', '决策人', '复盘'], '中等'],
  [1, 9, '线上接口响应时间突然从 50ms 涨到 2s，你如何排查？', '先看监控定位范围（单接口还是全局、单机房还是全量），再按链路排查：应用日志与慢查询、数据库连接池与锁等待、缓存命中率、下游依赖耗时、GC 与线程池状态，必要时扩容或降级止血。', ['监控', '链路排查', '慢查询', '下游依赖', '止血'], '困难'],
  [1, 8, '未来三年你的职业规划是什么？', '结合岗位说明技术纵深与广度的安排：一年内吃透业务与技术栈并独立负责模块，两到三年在某一方向形成深度并带动小团队，长期向架构或技术专家方向发展，强调与公司业务目标的结合。', ['技术纵深', '业务理解', '阶段目标', '与岗位匹配'], '简单'],
  [2, 3, '请说明动态规划与贪心算法的区别，并各举一个例子。', '动态规划要求最优子结构且子问题重叠，需要保存状态、全局最优；贪心每步取局部最优且不可回退，只在具备贪心选择性质时正确，如活动选择；背包问题通常用动态规划。', ['最优子结构', '重叠子问题', '贪心选择', '反例'], '中等'],
  [2, 3, '如何判断一个链表是否有环？如果存在，如何找到入环点？', '快慢指针：慢指针每次一步、快指针两步，相遇则有环。找入环点时，一个指针回到头节点，两指针同速前进，再次相遇处即入环点。时间复杂度 O(n)、空间 O(1)。', ['快慢指针', '相遇', '入环点', '空间复杂度'], '中等'],
  [2, 4, '训练集表现很好但验证集很差，你会怎么处理？', '这是过拟合的典型表现：增加数据或数据增强、加正则化与 Dropout、简化模型、早停、交叉验证；同时检查是否存在数据泄漏、分布不一致或划分方式不合理。', ['过拟合', '正则化', '早停', '数据泄漏', '分布一致'], '中等'],
  [2, 6, '为什么选择算法工程师方向，你为此做了哪些准备？', '说明兴趣来源与长期投入：系统学习数学与机器学习基础、复现过哪些论文或项目、参加过哪些竞赛或工程落地，并说明希望在哪个细分方向深入。', ['兴趣来源', '知识储备', '项目经历', '细分方向'], '简单'],
  [2, 8, '算法工程师未来想走研究还是工程路线？', '先说明两者并非对立：短期以工程落地为主，把模型真正上线并产生业务价值；中期在某一方向形成研究深度，能独立定义问题与设计实验；长期做研究与工程兼顾的技术负责人。', ['工程落地', '研究深度', '阶段安排', '业务价值'], '简单'],
  [2, 10, '业务方要求快速上线一个效果一般的模型，你怎么取舍？', '先明确业务目标与可接受的效果下限，评估快速方案的风险与后续迭代成本，给出分阶段方案：先上线可用版本并埋点收集数据，同时并行优化模型，设定复盘节点与回退条件。', ['目标对齐', '风险收益', '分阶段', '回退条件'], '中等'],
  [3, 6, '你如何判断一个需求该不该做？优先级框架是什么？', '先看需求是否服务于当前阶段目标与核心指标，再评估用户价值、实现成本与机会成本。常用框架：RICE（触达、影响、信心、成本）或 KANO 模型区分基础型与期望型需求。', ['阶段目标', '用户价值', '实现成本', 'RICE'], '中等'],
  [3, 10, '研发资源不足，两个需求都重要，你如何取舍？', '把「都重要」拆成可比较的维度：影响用户规模、对核心指标的贡献、上线时间窗口、依赖关系与不可逆程度；与业务方共同确认优先级并公开决策依据，给出被延后需求的替代方案与时间点。', ['量化影响', '时间窗口', '决策依据', '替代方案'], '中等'],
  [3, 11, '如何推动一个跨部门的需求落地？', '先对齐共同目标与各自收益，明确责任人与里程碑，把大目标拆成可交付的小节点，建立固定同步节奏与风险上报机制，用数据呈现阶段成果维持各方投入。', ['共同目标', '责任人', '里程碑', '同步节奏'], '中等'],
  [3, 7, '举例说明你如何用数据驱动一次产品迭代。', '按「假设—指标—实验—结论」展开：先提出可验证的假设，定义核心指标与护栏指标，设计 A/B 实验并保证样本量与显著性，最后根据结果决定全量、迭代或放弃，并沉淀认知。', ['假设', '核心指标', 'A/B 实验', '显著性', '沉淀'], '困难'],
  [3, 8, '你希望在产品方向上成长为什么样的角色？', '说明想从功能执行者成长为能定义问题、判断价值的产品负责人：短期补齐数据分析与用户研究能力，中期独立负责一条业务线的目标与规划，长期关注商业与行业的判断力。', ['定义问题', '业务线负责', '能力补齐', '商业判断'], '简单'],
  [3, 9, '产品上线后核心指标不升反降，你怎么处理？', '先确认数据本身是否可信（埋点、口径、样本），再定位是局部还是全局下降，拆维度找原因（渠道、版本、人群），判断是否与本次改动相关，必要时回滚并设计后续验证实验。', ['数据可信', '维度拆分', '相关性', '回滚验证'], '困难'],
  [3, 4, '如何设计一个新用户引导流程？关键指标是什么？', '先明确激活的定义与目标用户，把首次价值体验前置，减少必填与分支，用渐进式引导代替长流程。关键指标：激活率、首次关键行为完成率、次日留存与引导流失节点。', ['激活定义', '价值前置', '渐进引导', '激活率', '留存'], '中等'],
  [4, 2, 'SQL 中 window function 的典型使用场景有哪些？', '常用于分组内排名（ROW_NUMBER/RANK）、同组内累计与移动平均（SUM OVER）、组内占比、同环比对比以及去重取最新记录。它不折叠行数，可与明细同时展示。', ['排名', '累计', '占比', '不折叠行'], '中等'],
  [4, 3, '如何判断一次 A/B 测试的结果是否显著？', '先确认实验设计（随机分组、样本量、单一变量），选择对应检验方法（比例用 z 检验、均值用 t 检验），看 p 值与置信区间，同时检查护栏指标与 novelty effect，避免多重比较导致的假阳性。', ['随机分组', '样本量', 'p 值', '置信区间', '假阳性'], '困难'],
  [4, 4, '用户流失分析你会从哪些维度切入？', '先定义流失口径与观察窗口，再按时间、渠道、人群、行为路径拆分，结合同期群（cohort）看留存曲线拐点，用关键行为次数或功能使用深度找流失前兆，最后做归因与干预实验。', ['流失口径', '同期群', '留存曲线', '行为前兆', '归因'], '中等'],
  [4, 6, '请介绍一个你用数据解决业务问题的案例。', '按「业务问题—数据方案—分析过程—结论与行动—结果」展开，强调口径定义、数据清洗与假设验证，以及最终业务动作与可量化收益。', ['业务问题', '口径定义', '假设验证', '业务动作', '收益'], '中等'],
  [4, 7, '业务方不认可你的分析结论，你怎么办？', '先确认分歧来自数据口径、样本范围还是业务假设，把结论拆成可验证的子命题逐条对齐，必要时用更小的实验或补充数据验证，最终以共同认可的口径重新给出结论与建议。', ['口径对齐', '拆解命题', '补充验证', '共同结论'], '中等'],
  [4, 10, '老板要的指标和分析结论冲突，你如何处理？', '坚持数据事实，同时理解老板诉求背后的业务目标，说明冲突原因与可能的口径差异，给出多口径对照与风险提示，把判断依据完整呈现，让决策透明可追溯。', ['数据事实', '业务目标', '多口径', '风险提示'], '中等'],
  [4, 11, '如何让业务方真正用起来你做的看板？', '先参与指标定义让业务方有参与感，围绕其决策场景设计核心指标而非堆砌图表，提供下钻与自助分析能力，上线后做使用培训并用使用率数据持续迭代。', ['指标共建', '决策场景', '下钻', '使用率迭代'], '中等'],
  [5, 4, '如何为一个 REST 接口设计完整的自动化测试用例？', '覆盖正常流、边界值与异常流：参数校验、权限与鉴权、幂等与并发、错误码与响应结构、依赖服务异常与超时，配合测试数据隔离与清理策略，并纳入 CI 每次提交执行。', ['正常流', '边界值', '异常流', '幂等', 'CI'], '中等'],
  [5, 9, '版本发布后出现偶现崩溃，你如何定位？', '先收集现场：崩溃日志、堆栈、设备与版本分布、复现路径；尝试稳定复现（压测、并发、弱网），用二分法定位引入版本与代码变更，补充监控与符号化能力，修复后加回归用例。', ['现场收集', '稳定复现', '二分定位', '回归用例'], '困难'],
  [5, 5, '如何测试一个存在安全要求的登录接口？', '覆盖认证与授权：密码强度与加密传输、错误次数限制与锁定、验证码与防重放、越权访问、SQL 注入与 XSS 输入、会话失效与登出、日志脱敏，并检查是否泄露敏感信息。', ['加密传输', '限流锁定', '越权', '注入', '日志脱敏'], '中等'],
  [5, 7, '开发和测试对缺陷严重级别有分歧，你怎么处理？', '回到影响面与用户感知：用复现步骤、影响范围、发生概率和是否有绕过方案来量化，参考团队既定的分级标准，必要时请产品一起判定，并把争议案例补充进标准以减少下次分歧。', ['影响面', '复现步骤', '分级标准', '案例沉淀'], '中等'],
  [5, 8, '你希望在测试开发方向如何成长？', '短期打牢测试设计与自动化框架能力，中期建设质量度量体系与效能工具，长期向质量架构或效能平台方向发展，强调用工程手段把质量内建到研发流程中。', ['测试设计', '自动化框架', '质量度量', '效能平台'], '简单'],
  [5, 10, '上线时间被压缩，测试范围不得不裁剪，你怎么做？', '基于风险排序：优先保障核心链路与高频场景，明确不测范围与残余风险并让相关方确认，用自动化回归覆盖稳定部分，上线后加强监控与快速回滚预案。', ['风险排序', '核心链路', '残余风险', '监控回滚'], '中等'],
];

function seedIfNeeded() {
  // 账号与领域数据分开判断，旧库升级时能只补缺失的那一部分。
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const domainCount = db.prepare('SELECT COUNT(*) AS c FROM job_positions').get().c;
  if (userCount > 0 && domainCount > 0) return;

  const insUser = db.prepare('INSERT INTO users (username,password,role,nickname,target_role,created_at) VALUES (?,?,?,?,?,?)');
  const pickUser = (name, pwd, role, nick, target, d) => {
    const found = db.prepare('SELECT id FROM users WHERE username = ?').get(name);
    if (found) return found.id;
    return insUser.run(name, hashPassword(pwd), role, nick, target, day(d, 9)).lastInsertRowid;
  };
  const adminId = pickUser('admin', 'admin123', 'admin', '管理员', '技术负责人', 30);
  const candId = pickUser('candidate', 'candidate123', 'user', '张同学', '前端工程师', 21);
  const jobId = pickUser('jobseeker', 'jobseeker123', 'user', '刘同学', '后端工程师', 14);

  // 已有领域数据则不重复铺
  if (domainCount > 0) {
    console.log('[seed] 账号已补齐，领域数据已存在，跳过');
    return;
  }

  // —— 岗位库 ——
  const insPos = db.prepare('INSERT INTO job_positions (name,category,level,description,skills,dimensions,is_builtin,created_at) VALUES (?,?,?,?,?,?,1,?)');
  const posIds = POSITIONS.map((p, i) => insPos.run(p[0], p[1], p[2], p[3], JSON.stringify(p[4]), JSON.stringify(p[5]), day(28 - i, 9, 30)).lastInsertRowid);

  // —— 题目分类 ——
  const insCat = db.prepare('INSERT INTO question_categories (name,kind,description,created_at) VALUES (?,?,?,?)');
  const catIds = CATEGORIES.map((c2, i) => insCat.run(c2[0], c2[1], c2[2], day(27 - (i % 8), 10, 15)).lastInsertRowid);

  // —— 题库（40 道，跨 8 个日期）——
  const insQ = db.prepare('INSERT INTO question_bank (position_id,category_id,content,reference_answer,key_points,difficulty,is_builtin,user_id,created_at) VALUES (?,?,?,?,?,?,1,NULL,?)');
  const qIds = QUESTIONS.map((q, i) =>
    insQ.run(posIds[q[0]], catIds[q[1]], q[2], q[3], JSON.stringify(q[4]), q[5], day(i % 8, 9 + (i % 8), (i * 7) % 60)).lastInsertRowid,
  );

  // —— 面试会话（8 场，覆盖 4 种状态，跨 7 个日期）——
  const insSession = db.prepare(
    'INSERT INTO interview_sessions (user_id,title,position_id,role,level,status,score,round_count,started_at,completed_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  );
  const mkSession = (userId, title, posIdx, role, level, status, score, rounds, createdDay, doneDay) =>
    insSession.run(
      userId, title, posIds[posIdx], role, level, status, score, rounds,
      status === 'created' ? null : day(createdDay, 10, 5),
      status === 'completed' || status === 'evaluated' ? day(doneDay, 11, 20) : null,
      day(createdDay, 10, 0),
    ).lastInsertRowid;

  const sCreated1 = mkSession(jobId, '后端工程师中级模拟面试（草稿）', 1, '后端工程师', '中级', 'created', 0, 0, 0, 0);
  const sCreated2 = mkSession(candId, '前端工程师初级模拟面试（草稿）', 0, '前端工程师', '初级', 'created', 0, 0, 1, 0);
  const sRunning1 = mkSession(candId, '前端工程师中级模拟面试', 0, '前端工程师', '中级', 'in_progress', 0, 3, 2, 0);
  const sRunning2 = mkSession(jobId, '后端工程师高级模拟面试', 1, '后端工程师', '高级', 'in_progress', 0, 2, 3, 0);
  const sDone1 = mkSession(candId, '前端工程师综合面试（已完成）', 0, '前端工程师', '中级', 'completed', 0, 4, 4, 4);
  const sDone2 = mkSession(jobId, '数据分析师转岗面试', 4, '数据分析师', '中级', 'completed', 0, 3, 5, 5);
  const sEval1 = mkSession(candId, '前端工程师中级面试（已评估）', 0, '前端工程师', '中级', 'evaluated', 78, 4, 6, 6);
  const sEval2 = mkSession(jobId, '后端工程师中级面试（已评估）', 1, '后端工程师', '中级', 'evaluated', 71, 3, 8, 8);

  // —— 轮次 + 消息 + 答案分析 ——
  const insRound = db.prepare(
    'INSERT INTO interview_rounds (user_id,session_id,round_no,question_id,question,answer,tech_score,clarity_score,depth_score,overall,summary,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
  );
  const insMsg = db.prepare('INSERT INTO messages (user_id,session_id,round_id,role,content,card_type,created_at) VALUES (?,?,?,?,?,?,?)');
  const insAnalysis = db.prepare(
    'INSERT INTO answer_analyses (user_id,session_id,round_id,question,answer,hit_points,missed_points,score,comment,source,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  );

  // 每场进行中/已完成/已评估的会话都铺 3~4 轮真实问答
  const roundSpecs = [
    { sid: sRunning1, uid: candId, qs: [0, 1, 3], day0: 2 },
    { sid: sRunning2, uid: jobId, qs: [7, 8], day0: 3 },
    { sid: sDone1, uid: candId, qs: [0, 2, 3, 5], day0: 4 },
    { sid: sDone2, uid: jobId, qs: [28, 29, 31], day0: 5 },
    { sid: sEval1, uid: candId, qs: [0, 1, 3, 4], day0: 6 },
    { sid: sEval2, uid: jobId, qs: [7, 9, 13], day0: 8 },
  ];

  const answerSamples = [
    '事件循环是 JS 处理异步的核心机制。同步代码在调用栈执行，异步任务分成宏任务和微任务，每次宏任务执行完会清空所有微任务队列，然后再取下一个宏任务。Promise 的回调是微任务，setTimeout 是宏任务。',
    '我理解不写依赖数组是每次渲染后都会执行，空数组只在挂载时执行一次，写具体值就是依赖变化时才执行，返回的清理函数会在下次执行前调用。',
    '我做过一个首屏 3 秒的页面优化：先做路由懒加载和代码分割把首包压下来，图片改成 WebP 并做懒加载，静态资源上 CDN 开 gzip，关键 CSS 内联，首屏从 3 秒降到 1.4 秒。',
    '强缓存不发请求直接用本地副本，对应 Cache-Control 的 max-age；协商缓存会带 ETag 去问服务端，命中返回 304，用 If-None-Match 和 If-Modified-Since。',
    '索引把全表扫描变成 B+ 树的定位查找，叶子节点成链所以范围查询也快。失效的情况有对索引列做函数运算、隐式类型转换、以百分号开头的模糊查询，还有联合索引不满足最左前缀。',
    '高并发秒杀我会分层削峰：前端限流防重复提交，网关做限流和黑名单，库存预热到 Redis 用 Lua 保证原子扣减，下单走消息队列异步落库，数据库最终扣减并且用唯一键做幂等。',
    '我先看监控确认影响范围，是单接口还是全局，然后按链路排查：应用日志、慢查询、连接池、缓存命中率、下游依赖耗时，必要时先扩容或者降级止血。',
    '窗口函数可以用来做组内排名，像 ROW_NUMBER 和 RANK，也可以做组内累计和移动平均，还能算组内占比，它不会折叠行数，可以和明细一起展示。',
    '我先确认实验设计是不是随机分组、样本量够不够、有没有同时改多个变量，然后做 z 检验看 p 值和置信区间，同时检查护栏指标，避免多重比较带来的假阳性。',
    '我会先定义流失口径和观察窗口，再按渠道、人群、行为路径拆，用同期群看留存曲线拐点，找流失前的关键行为变化，最后做归因和干预实验。',
    '我和同事在方案上有分歧时，会先回到目标和约束上对齐评价标准，能用数据验证的就做小范围验证，明确决策人和时间点，事后复盘看效果。',
    '线上接口变慢我会先看监控定位范围，然后查应用日志和慢查询、数据库连接池和锁等待、缓存命中率、下游依赖耗时，还有 GC 和线程池状态，先止血再根因。',
  ];

  let answerCursor = 0;
  let roundCounter = 0;
  for (const spec of roundSpecs) {
    spec.qs.forEach((qi, idx) => {
      roundCounter += 1;
      const q = QUESTIONS[qi];
      const answer = answerSamples[answerCursor % answerSamples.length];
      answerCursor += 1;
      const points = q[4];
      const hit = points.filter((p) => answer.includes(p));
      const missed = points.filter((p) => !answer.includes(p));
      const tech = Math.max(45, Math.min(95, 52 + Math.round((hit.length / points.length) * 40)));
      const clarity = Math.max(48, Math.min(94, 58 + Math.min(24, Math.round(answer.length / 14))));
      const depth = Math.max(42, Math.min(93, tech - 4 + (idx % 3) * 3));
      const overall = Math.round((tech + clarity + depth) / 3);
      const ts = day(Math.max(0, spec.day0 - Math.floor(idx / 2)), 10, 6 + idx * 9);
      const roundId = insRound.run(
        spec.uid, spec.sid, idx + 1, qIds[qi], q[2], answer, tech, clarity, depth, overall,
        `第 ${idx + 1} 轮：要点命中 ${hit.length}/${points.length}，${overall >= 80 ? '表现稳定' : '仍有提升空间'}。`,
        ts,
      ).lastInsertRowid;

      insMsg.run(spec.uid, spec.sid, roundId, 'ai', q[2], 'ai:local', ts);
      insMsg.run(spec.uid, spec.sid, roundId, 'user', answer, '', ts);

      insAnalysis.run(
        spec.uid, spec.sid, roundId, q[2], answer,
        JSON.stringify(hit), JSON.stringify(missed), overall,
        hit.length === points.length
          ? '要点覆盖完整，表达有条理，可以再补一个具体案例增强说服力。'
          : `命中 ${hit.length}/${points.length} 个要点，遗漏的关键点建议结合项目经历补齐。`,
        'local', ts,
      );
    });
  }

  // —— 报告 + 技能评分（已完成 / 已评估会话）——
  const insReport = db.prepare(
    'INSERT INTO reports (user_id,session_id,overall,logic,depth,expression,summary,suggestions,source,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  );
  const insSkill = db.prepare(
    'INSERT INTO skill_assessments (user_id,session_id,report_id,dimension,dimension_key,score,level,comment,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
  );
  const insPlan = db.prepare(
    'INSERT INTO practice_plans (user_id,session_id,report_id,title,dimension,dimension_key,reason,target_questions,suggested_minutes,progress,status,due_date,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  );

  function levelOf(score) {
    if (score >= 85) return '优秀';
    if (score >= 70) return '良好';
    if (score >= 55) return '及格';
    return '待提升';
  }

  const reportSpecs = [
    { sid: sDone1, uid: candId, overall: 74, logic: 78, depth: 68, expression: 76, day: 4, plan: false },
    { sid: sDone2, uid: jobId, overall: 69, logic: 73, depth: 64, expression: 70, day: 5, plan: false },
    { sid: sEval1, uid: candId, overall: 78, logic: 84, depth: 70, expression: 80, day: 6, plan: true },
    { sid: sEval2, uid: jobId, overall: 71, logic: 76, depth: 62, expression: 74, day: 8, plan: true },
  ];

  const planStore = [];
  for (const r of reportSpecs) {
    const reportId = insReport.run(
      r.uid, r.sid, r.overall, r.logic, r.depth, r.expression,
      `本场面试共 ${r.sid === sDone2 || r.sid === sEval2 ? 3 : 4} 轮问答，整体表现${r.overall >= 80 ? '优秀' : r.overall >= 70 ? '良好' : '中等'}。项目经验描述具体，逻辑链条清楚；技术原理部分偏结论化，可补充底层实现细节。`,
      '回答技术原理时先给结论，再补底层实现或源码层面的细节，体现深度；\n介绍项目时使用「问题—方案—结果」结构，让表达更有说服力；\n主动追问面试官关注点，展现沟通意愿。',
      'local', day(r.day, 11, 30),
    ).lastInsertRowid;

    const dims = [
      { key: 'logic', label: '逻辑性', score: r.logic, comment: '回答结构清晰，能按「结论—论据」组织内容。' },
      { key: 'depth', label: '专业深度', score: r.depth, comment: '原理层展开不足，建议补充实现机制与边界条件。' },
      { key: 'expression', label: '表达力', score: r.expression, comment: '语速与信息密度合适，可增加量化结果增强说服力。' },
      { key: 'engineering', label: '工程实践', score: Math.max(50, r.overall - 3), comment: '有真实项目落地经验，可进一步说明取舍依据。' },
    ];
    dims.forEach((d, i) => {
      insSkill.run(r.uid, r.sid, reportId, d.label, d.key, d.score, levelOf(d.score), d.comment, day(r.day, 11, 35 + i));
    });

    if (r.plan) {
      const weak = dims.filter((d) => d.score < 75).sort((a, b) => a.score - b.score).slice(0, 2);
      weak.forEach((d, i) => {
        const minutes = d.score < 60 ? 120 : d.score < 70 ? 90 : 60;
        const qs = QUESTIONS.filter((q) => (d.key === 'depth' ? q[1] === 1 || q[1] === 2 : d.key === 'expression' ? q[1] >= 6 : true))
          .slice(0, 3)
          .map((q) => q[2]);
        const status = i === 0 ? 'in_progress' : 'pending';
        const progress = i === 0 ? 40 : 0;
        const planId = insPlan.run(
          r.uid, r.sid, reportId,
          `${d.label}弱项强化计划`,
          d.label, d.key,
          `本场面试「${d.label}」得分 ${d.score} 分（低于 75 分阈值），建议针对性练习。`,
          JSON.stringify(qs.length ? qs : ['回顾本场遗漏要点并重写答案']),
          minutes, progress, status,
          day(Math.max(0, r.day - 3), 12, 0),
          day(r.day, 12, 0),
          day(Math.max(0, r.day - (progress ? 1 : 0)), 12, 30),
        ).lastInsertRowid;
        planStore.push(planId);
      });
    }
  }

  // 一条已完成的练习计划，覆盖 done 状态
  insPlan.run(
    candId, sEval1, null,
    '逻辑性巩固计划（已完成）',
    '逻辑性', 'logic',
    '早期面试中回答结构偏散，按计划完成结构化表达练习后已明显改善。',
    JSON.stringify([QUESTIONS[0][2], QUESTIONS[3][2]]),
    60, 100, 'done',
    day(2, 12, 0), day(5, 12, 0), day(1, 12, 30),
  );

  console.log('[seed] InterviewGo 已创建 3 个账号 / 6 个岗位 / 12 个分类 / 40 道题 / 8 场会话');
}

// 模块加载即确保种子存在：测试与 server 都依赖 admin 账号，放在这里避免遗漏。
seedIfNeeded();

module.exports = {
  db, seedIfNeeded, DB_PATH,
  SESSION_STATES, SESSION_FLOW, PLAN_STATES, PLAN_FLOW, canTransition,
};
