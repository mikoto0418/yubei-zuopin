const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.EXAMPREP_DB || path.join(__dirname, 'examprep.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ============================================================
// 建表（12 张）
// users / subjects / knowledge_points / goals / plans / plan_blocks
// tasks / mock_exams / wrong_questions / study_materials / reminders / stats
// ============================================================
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'student',
  target_exam   TEXT NOT NULL DEFAULT '考研',
  exam_date     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS subjects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT 'blue',
  exam_type  TEXT NOT NULL DEFAULT '考研',
  sort_no    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS knowledge_points (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id  INTEGER NOT NULL,
  user_id     INTEGER NOT NULL,
  name        TEXT NOT NULL,
  chapter     TEXT,
  difficulty  INTEGER NOT NULL DEFAULT 3,
  mastery     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (subject_id) REFERENCES subjects(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS goals (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL,
  subject   TEXT NOT NULL,
  target    INTEGER NOT NULL DEFAULT 100,
  weight    INTEGER NOT NULL DEFAULT 1,
  progress  INTEGER NOT NULL DEFAULT 0,
  status    TEXT NOT NULL DEFAULT 'active',
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS plans (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL,
  plan_date TEXT NOT NULL,
  subject   TEXT NOT NULL,
  content   TEXT NOT NULL,
  exam_hours REAL NOT NULL DEFAULT 0,
  done      INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 时间块：计划按 30 分钟粒度排到日历上
CREATE TABLE IF NOT EXISTS plan_blocks (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL,
  plan_id            INTEGER,
  subject            TEXT NOT NULL,
  title              TEXT NOT NULL,
  block_date         TEXT NOT NULL,
  start_time         TEXT NOT NULL,
  end_time           TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'planned',
  skip_reason        TEXT,
  source             TEXT NOT NULL DEFAULT 'manual',
  knowledge_point_id INTEGER,
  created_at         TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  subject     TEXT NOT NULL,
  total       INTEGER NOT NULL DEFAULT 0,
  correct     INTEGER NOT NULL DEFAULT 0,
  tags        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS mock_exams (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL,
  exam_name      TEXT NOT NULL,
  exam_date      TEXT NOT NULL,
  total_score    REAL NOT NULL DEFAULT 0,
  full_score     REAL NOT NULL DEFAULT 500,
  subject_scores TEXT,
  rank_no        INTEGER,
  note           TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS wrong_questions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL,
  subject        TEXT NOT NULL,
  knowledge_point TEXT,
  question       TEXT NOT NULL,
  my_answer      TEXT,
  right_answer   TEXT,
  wrong_reason   TEXT,
  status         TEXT NOT NULL DEFAULT 'new',
  review_count   INTEGER NOT NULL DEFAULT 0,
  last_review_at TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS study_materials (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  subject     TEXT NOT NULL,
  title       TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'link',
  url         TEXT,
  total_pages INTEGER NOT NULL DEFAULT 0,
  read_pages  INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'reading',
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS reminders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  title        TEXT NOT NULL,
  remind_at    TEXT NOT NULL,
  related_type TEXT,
  related_id   INTEGER,
  status       TEXT NOT NULL DEFAULT 'pending',
  channel      TEXT NOT NULL DEFAULT 'app',
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS stats (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  stat_date  TEXT NOT NULL,
  hours      REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_user_date ON plan_blocks(user_id, block_date);
CREATE INDEX IF NOT EXISTS idx_kp_subject ON knowledge_points(subject_id);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id, remind_at);
`);

// ---- 工具 ----
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    target_exam: u.target_exam,
    exam_date: u.exam_date,
    created_at: u.created_at,
  };
}

function hashPassword(plain) { return bcrypt.hashSync(plain, 10); }
function verifyPassword(plain, hash) { return bcrypt.compareSync(plain, hash); }

function ymd(d) { return d.toISOString().slice(0, 10); }
function dayOffset(n) { return ymd(new Date(Date.now() + n * 86400000)); }

// 状态机定义（供路由与测试共用）
const BLOCK_STATUSES = ['planned', 'in_progress', 'done', 'skipped'];
const BLOCK_TRANSITIONS = {
  planned: ['in_progress', 'done', 'skipped'],
  in_progress: ['done', 'skipped'],
  done: [],
  skipped: [],
};

// ============================================================
// 种子：3 账号 + 6 科目 + 30 知识点 + 20 目标 + 50 计划块 + 40 做题
//       + 12 模考 + 25 错题 + 20 资料 + 15 提醒
// ============================================================
function seedIfNeeded() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;

  const tx = db.transaction(() => {
    // ---------- 账号（3 种角色）----------
    const insUser = db.prepare(
      'INSERT INTO users (username,password_hash,role,target_exam,exam_date) VALUES (?,?,?,?,?)'
    );
    const adminId = insUser.run('admin', hashPassword('admin123'), 'admin', '考研', '2026-12-20').lastInsertRowid;
    const demoId = insUser.run('demo', hashPassword('demo123'), 'student', '考研', '2026-12-20').lastInsertRowid;
    const mentorId = insUser.run('student1', hashPassword('student123'), 'mentor', '考研', '2026-12-20').lastInsertRowid;

    // ---------- 6 科目（demo 名下）----------
    const subjects = [
      ['数学', 'blue', 1], ['英语', 'green', 2], ['政治', 'red', 3],
      ['专业课', 'orange', 4], ['数据结构', 'purple', 5], ['计算机网络', 'teal', 6],
    ];
    const insSubject = db.prepare(
      'INSERT INTO subjects (user_id,name,color,exam_type,sort_no) VALUES (?,?,?,?,?)'
    );
    const subjectIds = {};
    for (const [name, color, sort] of subjects) {
      subjectIds[name] = insSubject.run(demoId, name, color, '考研', sort).lastInsertRowid;
    }

    // ---------- 30 知识点（每科 5 个）----------
    const kpDefs = {
      '数学': [['洛必达法则', '高数第三章', 4], ['等价无穷小代换', '高数第三章', 3], ['矩阵的秩', '线性代数', 4], ['定积分换元法', '高数第四章', 4], ['分部积分法', '高数第四章', 5]],
      '英语': [['长难句拆分', '阅读理解', 4], ['转折逻辑词', '完形填空', 3], ['图表作文模板', '写作', 3], ['高频词汇辨析', '词汇', 4], ['真题阅读定位', '阅读理解', 4]],
      '政治': [['唯物辩证法三大规律', '马原', 4], ['新民主主义革命理论', '毛中特', 4], ['时间轴与重要会议', '史纲', 3], ['思修法基核心概念', '思修', 2], ['主观题答题框架', '综合', 4]],
      '专业课': [['操作系统进程调度', '操作系统', 5], ['TCP 三次握手', '计算机网络', 4], ['数据库范式', '数据库', 3], ['编译原理词法分析', '编译原理', 5], ['软件工程 UML', '软件工程', 3]],
      '数据结构': [['二叉树的遍历', '树', 4], ['图的深搜广搜', '图', 5], ['排序算法复杂度', '排序', 3], ['哈希冲突处理', '查找', 4], ['动态规划入门', '算法', 5]],
      '计算机网络': [['TCP 拥塞控制', '传输层', 5], ['HTTP 与 HTTPS', '应用层', 3], ['IP 子网划分', '网络层', 4], ['DNS 解析过程', '应用层', 3], ['ARP 协议', '链路层', 3]],
    };
    const insKp = db.prepare(
      'INSERT INTO knowledge_points (subject_id,user_id,name,chapter,difficulty,mastery) VALUES (?,?,?,?,?,?)'
    );
    const kpIds = {};
    for (const [subj, list] of Object.entries(kpDefs)) {
      kpIds[subj] = [];
      list.forEach(([name, chapter, diff], i) => {
        const mastery = [82, 64, 45, 73, 38, 91, 57, 68, 42, 76][(i + subjects.findIndex((s) => s[0] === subj) * 3) % 10];
        const id = insKp.run(subjectIds[subj], demoId, name, chapter, diff, mastery).lastInsertRowid;
        kpIds[subj].push(id);
      });
    }

    // ---------- 20 个目标 ----------
    const insGoal = db.prepare(
      'INSERT INTO goals (user_id,subject,target,weight,progress,status) VALUES (?,?,?,?,?,?)'
    );
    const goalDefs = [
      [demoId, '数学', 130, 3, 96, 'active'], [demoId, '英语', 75, 2, 61, 'active'],
      [demoId, '政治', 70, 2, 52, 'active'], [demoId, '专业课', 120, 3, 88, 'active'],
      [demoId, '数据结构', 90, 2, 71, 'active'], [demoId, '计算机网络', 80, 2, 45, 'active'],
      [demoId, '数学', 120, 3, 120, 'archived'], [demoId, '英语', 70, 2, 70, 'achieved'],
      [mentorId, '数学', 120, 3, 74, 'active'], [mentorId, '英语', 70, 2, 58, 'active'],
      [mentorId, '政治', 65, 2, 49, 'active'], [mentorId, '专业课', 110, 3, 66, 'active'],
      [mentorId, '数据结构', 85, 2, 52, 'active'], [mentorId, '计算机网络', 75, 2, 40, 'active'],
      [adminId, '数学', 140, 3, 108, 'active'], [adminId, '英语', 80, 2, 66, 'active'],
      [adminId, '政治', 75, 2, 60, 'active'], [adminId, '专业课', 130, 3, 95, 'active'],
      [adminId, '数据结构', 95, 2, 78, 'active'], [adminId, '计算机网络', 85, 2, 55, 'active'],
    ];
    for (const g of goalDefs) insGoal.run(...g);

    // ---------- 计划主表（plans）----------
    const insPlan = db.prepare(
      'INSERT INTO plans (user_id,plan_date,subject,content,exam_hours,done) VALUES (?,?,?,?,?,?)'
    );
    const planTexts = [
      ['数学', '高数第三章：洛必达法则与等价无穷小代换专项 15 题，复盘错因并整理代换表', 2],
      ['英语', '真题阅读 Text1 限时 18 分钟，精翻 3 个长难句，整理生词 20 个', 1.5],
      ['政治', '马原·唯物辩证法三大规律：听课 1 讲 + 默写要点，真题选择 15 题', 1],
      ['数据结构', '二叉树遍历：前中后序 + 层序，手写递归与非递归实现各 1 遍', 1.5],
      ['计算机网络', 'TCP 拥塞控制四大算法：慢启动 / 拥塞避免 / 快重传 / 快恢复梳理', 1],
      ['专业课', '操作系统进程调度：FCFS / SJF / RR 三种算法计算题 8 道', 2],
    ];
    for (let i = 13; i >= 0; i--) {
      const ds = dayOffset(-i);
      const [sub, content, hours] = planTexts[(13 - i) % planTexts.length];
      insPlan.run(demoId, ds, sub, content, hours, i > 0 ? 1 : 0);
    }
    const todayPlanId = insPlan.run(
      demoId, dayOffset(0), '数学',
      '今日计划已在模板基础上编排；点击「生成 AI 计划」可由大模型按薄弱点重新定制并写入日历', 0.5, 0
    ).lastInsertRowid;

    // ---------- 50 个计划块（跨 14 天，30/60 分钟粒度）----------
    const insBlock = db.prepare(
      `INSERT INTO plan_blocks
       (user_id,plan_id,subject,title,block_date,start_time,end_time,status,skip_reason,source,knowledge_point_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    );
    const blockTpl = [
      ['数学', '洛必达法则专项 15 题', '08:00', '09:00', '洛必达法则'],
      ['英语', '真题阅读 Text1 精读', '09:00', '09:30', '真题阅读定位'],
      ['政治', '唯物辩证法要点默写', '10:00', '11:00', '唯物辩证法三大规律'],
      ['数据结构', '二叉树遍历手写', '14:00', '15:00', '二叉树的遍历'],
      ['计算机网络', 'TCP 拥塞控制梳理', '15:00', '15:30', 'TCP 拥塞控制'],
      ['专业课', '进程调度计算题 8 道', '16:00', '17:00', '操作系统进程调度'],
      ['数学', '矩阵的秩八大性质', '19:00', '20:00', '矩阵的秩'],
      ['英语', '长难句拆分训练', '20:00', '20:30', '长难句拆分'],
      ['政治', '史纲时间轴整理', '21:00', '22:00', '时间轴与重要会议'],
      ['数据结构', '图搜索算法练习', '08:30', '09:30', '图的深搜广搜'],
      ['专业课', 'TCP 三次握手与四次挥手', '10:30', '11:30', 'TCP 三次握手'],
      ['数学', '定积分换元法 12 题', '14:30', '15:30', '定积分换元法'],
    ];
    const skipReasons = ['临时加课，时间冲突', '身体不适，改为次日补做', '优先处理模考复盘'];
    const kpIdByName = {};
    Object.values(kpIds).flat().forEach((id) => {
      const row = db.prepare('SELECT name FROM knowledge_points WHERE id=?').get(id);
      kpIdByName[row.name] = id;
    });
    let blockCount = 0;
    const dayTotals = [4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 4]; // = 50
    for (let d = 13; d >= 0 && blockCount < 50; d--) {
      const ds = dayOffset(-d);
      const n = dayTotals[13 - d];
      for (let k = 0; k < n && blockCount < 50; k++) {
        const t = blockTpl[blockCount % blockTpl.length];
        let status = 'planned', reason = null;
        if (d > 0) {
          // 过去的日期：多数已完成，少量跳过，个别未完成（驱动"自动提醒补做"）
          if (blockCount % 9 === 4) { status = 'skipped'; reason = skipReasons[blockCount % skipReasons.length]; }
          else if (blockCount % 11 === 7) { status = 'planned'; }
          else if (blockCount % 13 === 10) { status = 'in_progress'; }
          else status = 'done';
        } else if (blockCount % 5 === 0) status = 'in_progress';
        insBlock.run(demoId, null, t[0], t[1], ds, t[2], t[3], status, reason,
          blockCount % 3 === 0 ? 'ai' : 'manual', kpIdByName[t[4]] || null);
        blockCount++;
      }
    }

    // ---------- 另外两个账号也有可看的当天时间块（保证任意账号登录都非空）----------
    const otherAccounts = [
      { id: mentorId, offset: 1, subject: '数学', title: '助教视角：极限专题带练', start: '09:00', end: '10:00' },
      { id: mentorId, offset: 0, subject: '数据结构', title: '助教视角：二叉树遍历答疑', start: '14:00', end: '15:00' },
      { id: adminId, offset: 2, subject: '英语', title: '管理视角：真题阅读精读', start: '08:30', end: '09:30' },
      { id: adminId, offset: 0, subject: '政治', title: '管理视角：马原要点梳理', start: '16:00', end: '17:00' },
    ];
    for (const o of otherAccounts) {
      insBlock.run(o.id, null, o.subject, o.title, dayOffset(-o.offset), o.start, o.end,
        o.offset > 0 ? 'done' : 'planned', null, 'manual', null);
    }

    // ---------- 40 条做题记录 ----------
    const insTask = db.prepare('INSERT INTO tasks (user_id,subject,total,correct,tags) VALUES (?,?,?,?,?)');
    const taskTpl = [
      ['数学', 20, 16, '等价无穷小,洛必达'], ['数学', 20, 13, '矩阵求秩,行列式'],
      ['数学', 15, 11, '定积分,分部积分'], ['英语', 20, 17, '真题阅读,长难句'],
      ['英语', 20, 15, '完形填空,转折词'], ['政治', 20, 16, '唯物辩证法,新民主主义革命'],
      ['数据结构', 18, 12, '二叉树的遍历,图的深搜广搜'], ['计算机网络', 16, 13, 'TCP 拥塞控制,IP 子网划分'],
      ['专业课', 22, 18, '操作系统进程调度,数据库范式'], ['政治', 15, 12, '时间轴与重要会议,主观题答题框架'],
    ];
    for (let i = 0; i < 40; i++) {
      const [sub, total, correct, tags] = taskTpl[i % taskTpl.length];
      const jitter = (i % 4) - 1;
      insTask.run(demoId, sub, total, Math.max(0, Math.min(total, correct + jitter)), tags);
    }

    // ---------- 12 次模考 ----------
    const insMock = db.prepare(
      'INSERT INTO mock_exams (user_id,exam_name,exam_date,total_score,full_score,subject_scores,rank_no,note) VALUES (?,?,?,?,?,?,?,?)'
    );
    const scoreTrend = [352, 361, 358, 372, 380, 376, 391, 398, 405, 412, 418, 427];
    scoreTrend.forEach((total, i) => {
      const math = 78 + i * 2, eng = 58 + Math.round(i * 1.2), pol = 62 + i;
      const major = 88 + i * 2, ds = 60 + i, net = 46 + Math.round(i * 1.6);
      insMock.run(
        demoId, `第 ${i + 1} 次全真模考`, dayOffset(-(11 - i) * 4), total, 500,
        JSON.stringify([
          { subject: '数学', score: math, full: 150 },
          { subject: '英语', score: eng, full: 100 },
          { subject: '政治', score: pol, full: 100 },
          { subject: '专业课', score: major, full: 150 },
          { subject: '数据结构', score: ds, full: 100 },
          { subject: '计算机网络', score: net, full: 100 },
        ]),
        120 - i * 7,
        i >= 9 ? '进入冲刺阶段，主观题得分明显提升' : '常规阶段检测'
      );
    });

    // ---------- 25 道错题 ----------
    const insWrong = db.prepare(
      `INSERT INTO wrong_questions
       (user_id,subject,knowledge_point,question,my_answer,right_answer,wrong_reason,status,review_count,last_review_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    );
    const wrongTpl = [
      ['数学', '洛必达法则', '求 lim(x→0) (e^x - 1 - x)/x² ', '1/2', '1/2', '直接洛必达两次但忘记验证 0/0 条件', 'new', 0],
      ['数学', '等价无穷小代换', '求 lim(x→0) (1-cos x)/x²', '0', '1/2', '误把 1-cos x 当作 x', 'new', 1],
      ['数学', '矩阵的秩', '求 4×5 矩阵的秩', '3', '4', '漏看一列线性无关', 'reviewing', 2],
      ['数学', '定积分换元法', '∫₀¹ x·e^{x²} dx', 'e-1', '(e-1)/2', '换元后忘记同步换限并漏乘 1/2', 'new', 0],
      ['数学', '分部积分法', '∫ x·ln x dx', 'x²lnx/2', 'x²lnx/2 - x²/4', '分部积分后漏减第二项', 'new', 0],
      ['英语', '长难句拆分', '2019 Text1 第 3 句主干判断', '选 B', '选 D', '被插入语打断，主干识别错误', 'reviewing', 3],
      ['英语', '转折逻辑词', '完形填空第 7 空', 'however', 'nevertheless', '忽略前后语义顺承关系', 'new', 1],
      ['英语', '图表作文模板', '描述上升趋势用词', 'increase', 'surge', '未区分幅度大小，用词不准确', 'mastered', 4],
      ['英语', '高频词汇辨析', 'affect / effect 辨析', 'affect(n.)', 'effect(n.)', '词性混淆', 'new', 0],
      ['政治', '唯物辩证法三大规律', '质量互变规律的材料分析', '只答对立统一', '质量互变 + 否定之否定', '原理罗列不全，漏答两个规律', 'new', 1],
      ['政治', '新民主主义革命理论', '三大法宝的选择题', '统一战线', '统一战线/武装斗争/党的建设', '多选题只选了一个', 'reviewing', 2],
      ['政治', '时间轴与重要会议', '中共七大召开时间', '1945 年延安', '1945 年延安', '知识点本身答对，但混淆了六大与七大', 'new', 0],
      ['政治', '主观题答题框架', '马原材料分析题', '直接抄材料', '原理 + 材料 + 结论', '缺少原理表述，只罗列材料', 'new', 0],
      ['数据结构', '二叉树的遍历', '中序非递归实现', '用队列', '用栈', '把层序的队列误用于中序', 'reviewing', 2],
      ['数据结构', '图的深搜广搜', 'BFS 求最短路径', '用栈', '用队列', 'DFS/BFS 数据结构用反', 'new', 1],
      ['数据结构', '排序算法复杂度', '快排最坏时间复杂度', 'O(n log n)', 'O(n²)', '只记平均忘了最坏', 'new', 0],
      ['数据结构', '哈希冲突处理', '开放地址法删除元素', '直接置空', '打删除标记', '置空会截断探测链', 'new', 0],
      ['计算机网络', 'TCP 拥塞控制', '慢启动阈值变化', '线性增长', '指数增长至阈值后线性', '混淆慢启动与拥塞避免', 'reviewing', 1],
      ['计算机网络', 'IP 子网划分', '192.168.1.0/26 可用主机数', '64', '62', '忘记扣除网络号与广播地址', 'new', 2],
      ['计算机网络', 'HTTP 与 HTTPS', 'HTTPS 默认端口', '8080', '443', '端口记忆错误', 'mastered', 3],
      ['计算机网络', 'DNS 解析过程', '递归与迭代查询区别', '两者相同', '递归由本地 DNS 代查，迭代逐级返回', '概念混淆', 'new', 0],
      ['专业课', '操作系统进程调度', 'RR 时间片轮转周转时间', '18ms', '22ms', '时间片切换点计算错误', 'new', 1],
      ['专业课', 'TCP 三次握手', '为什么需要三次握手', '两次就够', '防止失效连接请求', '答不出本质原因', 'reviewing', 2],
      ['专业课', '数据库范式', '3NF 判定', '满足 2NF 即可', '消除传递依赖', '漏掉传递依赖这一条', 'new', 0],
      ['专业课', '软件工程 UML', '用例图元素', '只画了用例', '参与者 + 用例 + 关系', '漏画参与者与关系', 'new', 0],
    ];
    wrongTpl.forEach((w, i) => {
      insWrong.run(
        demoId, w[0], w[1], w[2], w[3], w[4], w[5], w[6], w[7],
        w[6] === 'new' ? null : dayOffset(-(i % 7) - 1)
      );
    });

    // ---------- 20 份学习资料 ----------
    const insMat = db.prepare(
      `INSERT INTO study_materials (user_id,subject,title,type,url,total_pages,read_pages,status,note)
       VALUES (?,?,?,?,?,?,?,?,?)`
    );
    const matTpl = [
      ['数学', '《660 题》高等数学分册', 'book', null, 320, 214, 'reading', '重点刷选择填空'],
      ['数学', '高数第三章 洛必达法则讲义', 'link', 'https://example.com/math-ch3', 24, 24, 'finished', '已完整过一遍'],
      ['数学', '线代·矩阵的秩专题课', 'link', 'https://example.com/linear-algebra', 18, 9, 'reading', '看到第二节'],
      ['数学', '定积分换元法错题集', 'note', null, 40, 12, 'reading', '整理中'],
      ['英语', '考研英语真题 2015-2024', 'book', null, 480, 336, 'reading', '做到 2021 年'],
      ['英语', '长难句拆分 100 例', 'book', null, 200, 156, 'reading', '每天 5 句'],
      ['英语', '高频词汇红宝书', 'book', null, 360, 288, 'reading', '第 4 轮复习'],
      ['英语', '图表作文模板库', 'note', null, 30, 30, 'finished', '已背默 3 套'],
      ['政治', '马原核心考点精讲', 'link', 'https://example.com/marxism', 56, 48, 'reading', '唯物辩证法已掌握'],
      ['政治', '毛中特时间轴手账', 'note', null, 22, 22, 'finished', '重要会议全部标注'],
      ['政治', '肖四主观题背诵版', 'book', null, 120, 36, 'reading', '冲刺阶段使用'],
      ['政治', '史纲真题分类汇编', 'book', null, 180, 90, 'reading', '已完成一半'],
      ['数据结构', '《数据结构》严蔚敏版', 'book', null, 400, 260, 'reading', '树与图已过'],
      ['数据结构', '算法复杂度速查表', 'note', null, 12, 12, 'finished', '贴在书桌前'],
      ['数据结构', '动态规划专题讲义', 'link', 'https://example.com/dp', 32, 8, 'reading', '刚起步'],
      ['计算机网络', '《计算机网络》自顶向下', 'book', null, 520, 208, 'reading', '传输层进行中'],
      ['计算机网络', 'TCP/IP 详解卷一', 'book', null, 460, 92, 'reading', '作为拓展阅读'],
      ['计算机网络', '子网划分练习题 60 道', 'note', null, 60, 42, 'reading', '正确率稳步提升'],
      ['专业课', '操作系统考研考点精析', 'link', 'https://example.com/os', 88, 66, 'reading', '进程管理已过'],
      ['专业课', '历年专业课真题（10 年）', 'book', null, 300, 180, 'reading', '做完 6 套'],
    ];
    matTpl.forEach((m) => insMat.run(demoId, m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7]));

    // ---------- 15 条提醒 ----------
    const insRem = db.prepare(
      `INSERT INTO reminders (user_id,title,remind_at,related_type,related_id,status,channel)
       VALUES (?,?,?,?,?,?,?)`
    );
    const remTpl = [
      ['数学·洛必达法则专项即将开始', '08:00', 'plan_block', 'app'],
      ['英语真题阅读精读提醒', '09:00', 'plan_block', 'app'],
      ['政治要点默写提醒', '10:00', 'plan_block', 'sms'],
      ['数据结构二叉树遍历练习', '14:00', 'plan_block', 'app'],
      ['计算机网络拥塞控制复习', '15:00', 'plan_block', 'app'],
      ['专业课进程调度计算题', '16:00', 'plan_block', 'app'],
      ['晚间复盘：今日计划完成情况', '21:30', 'plan_block', 'app'],
      ['第 13 次模考报名提醒', '09:00', 'mock_exam', 'email'],
      ['错题本复做：数学洛必达 3 题', '20:00', 'wrong_question', 'app'],
      ['错题本复做：数据结构遍历 2 题', '20:30', 'wrong_question', 'app'],
      ['学习资料《660 题》进度提醒', '19:00', 'material', 'app'],
      ['英语红宝书第 5 轮复习提醒', '07:30', 'material', 'app'],
      ['未完成计划补做提醒', '22:00', 'plan_block', 'sms'],
      ['本周目标进度检查', '18:00', 'goal', 'app'],
      ['距考试 100 天倒计时提醒', '08:00', 'goal', 'email'],
    ];
    remTpl.forEach((r, i) => {
      const status = i < 7 ? 'sent' : (i < 12 ? 'pending' : 'done');
      insRem.run(demoId, r[0], `${dayOffset(i < 7 ? -1 : 0)} ${r[1]}`, r[2], null, status, r[3]);
    });

    // ---------- 学习时长（demo，近 10 天）----------
    const insStat = db.prepare('INSERT INTO stats (user_id,stat_date,hours) VALUES (?,?,?)');
    const hours = [3, 4.5, 3.5, 5, 4, 6, 2, 4.5, 5.5, 4];
    for (let i = 9; i >= 0; i--) insStat.run(demoId, dayOffset(-i), hours[9 - i]);
    void todayPlanId;
  });
  tx();
  console.log('[seed] 已创建 admin / demo / student1 账号及完整备考演示数据');
}

module.exports = {
  db, publicUser, hashPassword, verifyPassword, seedIfNeeded,
  BLOCK_STATUSES, BLOCK_TRANSITIONS, dayOffset, ymd,
};
