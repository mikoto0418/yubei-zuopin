require('dotenv').config();
const db = require('./db');
const bcrypt = require('bcryptjs');

function hash(pw) {
  return bcrypt.hashSync(pw, 10);
}

// 基准日：让种子数据跨越 14 天以上，仪表盘图表有真实内容
const BASE = new Date();
BASE.setHours(10, 0, 0, 0);
function dayOffset(days, hour = 10) {
  const d = new Date(BASE.getTime() - days * 86400000);
  d.setHours(hour, (days * 7) % 60, 0, 0);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:00`;
}
function dateOnly(days) {
  return dayOffset(days).slice(0, 10);
}

function ensureUser(username, password, role, nickname, avatar = '') {
  let row = db.prepare('SELECT id FROM users WHERE username=?').get(username);
  if (row) return row.id;
  const info = db
    .prepare('INSERT INTO users (username, password, role, nickname, avatar, created_at) VALUES (?,?,?,?,?,?)')
    .run(username, hash(password), role, nickname, avatar, dayOffset(40));
  return info.lastInsertRowid;
}

const PALETTE = ['orange', 'blue', 'green', 'purple', 'pink', 'teal'];

function seed() {
  const ids = {
    admin: ensureUser('admin', 'admin123', 'admin', '管理员', '🛠'),
    alice: ensureUser('alice', '123456', 'user', '阿梨', '🍐'),
    bob: ensureUser('bob', '123456', 'user', '小博', '📘'),
    carol: ensureUser('carol', '123456', 'user', '晓晴', '🌤'),
  };

  const count = (table, where = '', ...params) =>
    db.prepare(`SELECT COUNT(*) c FROM ${table} ${where}`).get(...params).c;

  // ============ 1) 项目分组：6 个 ============
  const projectSpec = [
    [ids.alice, '数据结构课程', 'orange', '本学期数据结构与算法课程的全部笔记与作业'],
    [ids.alice, '实习求职', 'blue', '简历、面经与投递跟踪'],
    [ids.alice, '科研入门', 'purple', '论文精读与实验复现'],
    [ids.bob, '雅思备考', 'green', '听说读写四项备考材料'],
    [ids.bob, '助教工作', 'teal', '课程助教的备课与答疑记录'],
    [ids.carol, '毕业设计', 'pink', '毕业设计相关的文献与实验'],
  ];
  if (count('projects') === 0) {
    const ins = db.prepare('INSERT INTO projects (user_id, name, color, description, archived, created_at, updated_at) VALUES (?,?,?,?,?,?,?)');
    projectSpec.forEach((p, i) => ins.run(p[0], p[1], p[2], p[3], i === 5 ? 1 : 0, dayOffset(20 - i), dayOffset(2 + i)));
  }
  const projectsOf = (uid) => db.prepare('SELECT * FROM projects WHERE user_id=? ORDER BY id').all(uid);
  const proj = {
    alice: projectsOf(ids.alice),
    bob: projectsOf(ids.bob),
    carol: projectsOf(ids.carol),
    admin: projectsOf(ids.admin),
  };

  // ============ 2) 标签：15 个 ============
  const tagSpec = [
    [ids.alice, '算法'], [ids.alice, '图论'], [ids.alice, '课程'], [ids.alice, '复盘'],
    [ids.alice, '求职'], [ids.alice, '科研'], [ids.alice, '论文'],
    [ids.bob, '英语'], [ids.bob, '写作'], [ids.bob, '词汇'], [ids.bob, '助教'],
    [ids.carol, '深度学习'], [ids.carol, '实验'], [ids.carol, '文献'],
    [ids.admin, '项目'],
  ];
  if (count('tags') === 0) {
    const ins = db.prepare('INSERT INTO tags (user_id, name, color, created_at) VALUES (?,?,?,?)');
    tagSpec.forEach((t, i) => ins.run(t[0], t[1], PALETTE[i % PALETTE.length], dayOffset(18 - (i % 14))));
  }

  const ensureTag = (uid, name) => {
    db.prepare('INSERT OR IGNORE INTO tags (user_id, name) VALUES (?,?)').run(uid, name);
    return db.prepare('SELECT id FROM tags WHERE user_id=? AND name=?').get(uid, name).id;
  };

  // ============ 3) 笔记：25 篇 + 版本 40 个 ============
  const noteSpec = [
    // [uid, projectIdx, title, content, tags[], favorite, daysAgo]
    [ids.alice, 0, '图的遍历：DFS 与 BFS', 'DFS 依赖栈（递归即隐式栈），适合找连通分量与拓扑排序。\nBFS 依赖队列，适合无权图最短路。\n两者都必须维护 visited，否则有环图会死循环。\n复杂度：邻接表 O(V+E)，邻接矩阵 O(V²)。', ['算法', '图论'], 1, 2],
    [ids.alice, 0, '最短路径算法对比', 'Dijkstra：非负权，贪心 + 优先队列，O(E log V)。\nBellman-Ford：可负权，能检测负环，O(VE)。\nFloyd：多源最短路，三重循环，O(V³)。\n选型口诀：单源非负用 Dijkstra，有负权用 BF，全源用 Floyd。', ['算法', '图论'], 1, 3],
    [ids.alice, 0, '最小生成树笔记', 'Kruskal 按边权排序 + 并查集，适合稀疏图。\nPrim 从点集扩张 + 优先队列，适合稠密图。\n两者结果权值相同，但形态可能不同。', ['算法'], 0, 5],
    [ids.alice, 0, '动态规划：背包问题', '01 背包倒序遍历容量，完全背包正序遍历。\n状态定义 dp[i][j] 表示前 i 件物品容量 j 的最大价值。\n滚动数组优化后空间降到 O(W)。', ['算法'], 0, 6],
    [ids.alice, 0, '复变函数错题集', '1. 留数定理应用时注意极点阶数判定；\n2. 柯西主值积分需要绕开奇点；\n3. 解析函数的充要条件是 C-R 方程成立且偏导连续。', ['课程', '复盘'], 1, 7],
    [ids.alice, 0, '操作系统：进程调度', '先来先服务简单但平均等待时间长。\n时间片轮转适合交互式系统。\n多级反馈队列兼顾响应与吞吐，是现代系统的主流。', ['课程'], 0, 9],
    [ids.alice, 1, '前端实习面试复盘', '一面：Vue3 响应式原理（Proxy + effect 依赖收集）。\n二面：手写 Promise.all、防抖节流、深拷贝。\n三面：项目难点追问，重点讲清楚取舍而不是堆技术名词。\n结论：八股要背，但项目讲述才是分水岭。', ['求职', '复盘'], 1, 1],
    [ids.alice, 1, '简历撰写要点', '用动词开头，量化结果。\n不要写"负责XX模块"，要写"重构XX模块，接口耗时从 800ms 降到 120ms"。\n一页纸原则，无关经历果断删。', ['求职'], 0, 4],
    [ids.alice, 1, '常见手写题清单', 'Promise.all / Promise.race\n防抖 debounce / 节流 throttle\n深拷贝 deepClone（处理循环引用）\n柯里化 curry\n发布订阅 EventEmitter', ['求职'], 0, 8],
    [ids.alice, 2, '注意力机制精读', 'Self-Attention 的核心是 Q、K、V 三个投影矩阵。\n缩放因子 1/√d_k 用于防止点积过大导致 softmax 梯度消失。\n多头机制让模型在不同子空间学习不同的依赖关系。', ['科研', '论文'], 1, 2],
    [ids.alice, 2, 'Transformer 结构梳理', 'Encoder 层 = 多头自注意力 + 前馈网络，各带残差与 LayerNorm。\nDecoder 额外插入交叉注意力，且自注意力需加因果掩码。\n位置编码用正弦函数，保证相对位置可线性表示。', ['科研', '论文'], 0, 5],
    [ids.alice, 2, '论文复现踩坑记录', '1. 学习率 warmup 不能省，否则前期直接发散；\n2. batch size 变化时要同步调整学习率；\n3. 随机种子必须固定，否则结果不可复现。', ['科研', '复盘'], 0, 10],
    [ids.alice, 2, '实验数据记录模板', '每次实验记录：日期 / 超参 / 数据集版本 / 指标 / 结论。\n不要只记最终指标，中间 loss 曲线往往更能说明问题。', ['科研'], 0, 11],
    [ids.bob, 3, '雅思写作 Task 2 模板', '结构：引言（改写题目 + 表明立场）→ 让步段 → 论证段 ×2 → 结论。\n连接词：Nevertheless / Consequently / In contrast。\n切忌模板句堆砌，观点必须有具体例子支撑。', ['英语', '写作'], 1, 2],
    [ids.bob, 3, '雅思核心词汇 200', 'ubiquitous 无处不在的\nmitigate 缓解\nalleviate 减轻\nsubstantiate 证实\npragmatic 务实的', ['英语', '词汇'], 1, 3],
    [ids.bob, 3, '听力精听方法', '第一遍盲听抓主旨，第二遍逐句听写，第三遍对照原文标出错点。\n错点分类：连读、弱读、生词、走神。\n连续两周每天 30 分钟，正确率从 60% 提到 80%。', ['英语'], 0, 6],
    [ids.bob, 3, '口语 Part 2 素材库', 'Describe a person who influenced you：\n讲我高中的数学老师，用具体事件（课后单独辅导 + 一句鼓励）支撑，最后落到"她让我相信努力是有回报的"。', ['英语'], 0, 9],
    [ids.bob, 3, '阅读判断题技巧', 'TRUE 是同义替换，FALSE 是直接矛盾，NOT GIVEN 是信息缺失。\n最容易错的是 FALSE 与 NOT GIVEN 的边界：找不到反证就是 NG。', ['英语'], 0, 12],
    [ids.bob, 4, '助教第一课备课记录', '讲清楚"为什么"比讲清楚"怎么做"更重要。\n准备了三道递进难度的例题，让不同基础的同学都能有收获。', ['助教'], 1, 4],
    [ids.bob, 4, '答疑常见问题汇总', '1. 为什么矩阵乘法不满足交换律——从线性变换的复合理解；\n2. 特征值的几何意义——变换前后方向不变的向量；\n3. 如何判断可对角化——n 个线性无关特征向量。', ['助教'], 0, 7],
    [ids.carol, 5, '毕业设计选题调研', '方向：基于对比学习的少样本图像分类。\n对比已有工作：SimCLR 依赖大 batch，MoCo 用动量队列缓解。\n我的切入点：在标注极少的垂直领域做轻量化改进。', ['文献'], 1, 3],
    [ids.carol, 5, '对比学习论文笔记', 'InfoNCE 损失本质是把正样本从负样本中区分出来。\n温度系数 τ 控制分布的锐利程度，太小会导致训练不稳定。', ['深度学习', '文献'], 0, 5],
    [ids.carol, 5, '实验环境搭建记录', 'CUDA 12.1 + PyTorch 2.1，注意 torch 版本与 cuda 版本必须匹配。\n显存不够时用梯度累积模拟大 batch。', ['实验'], 0, 8],
    [ids.carol, 5, '数据增强策略对比', '随机裁剪 + 颜色抖动是最稳的基线组合。\nCutMix 在小数据集上容易过拟合，需要配合更强的正则。', ['实验'], 0, 11],
    [ids.admin, 0, '工作台设计规划', '把笔记、简历、任务三者打通，形成学生个人工作台。\n核心差异化：命令面板 + 三栏工作区，键盘驱动全流程。', ['项目'], 0, 1],
  ];

  if (count('notes') === 0) {
    const insNote = db.prepare(
      'INSERT INTO notes (user_id, project_id, title, content, tags, favorite, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)'
    );
    const insVer = db.prepare(
      'INSERT INTO note_versions (note_id, user_id, version, title, content, tags, change_note, created_at) VALUES (?,?,?,?,?,?,?,?)'
    );
    const insLink = db.prepare('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?,?)');

    let versionBudget = 40; // 40 个版本快照
    noteSpec.forEach((spec, idx) => {
      const [uid, pi, title, content, tags, favorite, daysAgo] = spec;
      const projectList = proj[uid === ids.alice ? 'alice' : uid === ids.bob ? 'bob' : uid === ids.carol ? 'carol' : 'admin'];
      const projectId = projectList[pi] ? projectList[pi].id : null;
      const createdAt = dayOffset(daysAgo + 3);
      const updatedAt = dayOffset(daysAgo);
      const info = insNote.run(uid, projectId, title, content, tags.join(','), favorite, createdAt, updatedAt);
      const noteId = info.lastInsertRowid;
      tags.forEach((t) => insLink.run(noteId, ensureTag(uid, t)));

      // 版本历史：前 15 篇各 2 版 + 后 10 篇各 1 版 = 40 版
      const wantVersions = versionBudget > 0 ? (idx < 15 ? 2 : 1) : 0;
      for (let v = 1; v <= wantVersions && versionBudget > 0; v++) {
        const isLast = v === wantVersions;
        insVer.run(
          noteId, uid, v,
          title,
          isLast ? content : content.slice(0, Math.max(20, Math.floor(content.length * 0.6))) + '\n（早期草稿，内容尚不完整）',
          tags.join(','),
          v === 1 ? '创建笔记' : '补充内容',
          dayOffset(daysAgo + (wantVersions - v) + 1)
        );
        versionBudget--;
      }
    });
  }

  // ============ 4) 简历：8 份 + 20 条经历 ============
  const resumeSpec = [
    { uid: ids.alice, title: '2026 前端实习简历', job: '前端开发实习生', status: 'final',
      skills: ['Vue3', 'JavaScript', 'TypeScript', 'Node.js', 'CSS', 'Vite'],
      exps: [
        { org: '校学生项目组', role: '全栈开发', s: '2025-03', e: '2025-08', desc: '独立搭建前后端分离的作业管理系统，服务 200+ 同学。', hl: ['独立完成前后端分离架构设计与实现。', '系统上线后服务 200 余名同学，日均请求 3000+。'] },
        { org: '某互联网公司', role: '前端开发实习生', s: '2025-09', e: '2026-01', desc: '参与中台管理系统的组件库建设，沉淀 12 个通用组件。', hl: ['沉淀 12 个通用业务组件，被 4 条业务线复用。', '优化首屏加载策略，LCP 从 3.2s 降到 1.4s。'] },
        { org: '校实验室', role: '数据分析成员', s: '2024-09', e: '2025-01', desc: '编写数据清洗脚本并制作可视化报表。', hl: ['用 Python 完成 5 万条数据的清洗与统计。'] },
        { org: '校园技术社团', role: '前端负责人', s: '2024-03', e: '2024-08', desc: '负责社团官网改版与活动页开发。', hl: ['主导官网改版，首屏加载时间降低 55%。', '带 3 名新成员完成入门培训。'] },
      ] },
    { uid: ids.alice, title: '科研助理申请简历', job: '科研助理', status: 'polished',
      skills: ['Python', 'PyTorch', '论文写作'],
      exps: [
        { org: '计算机视觉实验室', role: '本科生研究员', s: '2025-02', e: '2025-07', desc: '参与少样本图像分类课题，负责数据管线与消融实验。', hl: ['搭建数据管线，将预处理耗时缩短 40%。', '完成 8 组消融实验，定位关键超参。'] },
        { org: '数学建模竞赛', role: '队长', s: '2024-09', e: '2024-09', desc: '负责建模与论文撰写，获省级二等奖。', hl: ['带队获省级二等奖。'] },
        { org: '校级创新基金', role: '参与人', s: '2024-05', e: '2025-05', desc: '负责实验设计与数据分析部分。', hl: ['设计 6 组对照实验，结论被项目组采纳。'] },
      ] },
    { uid: ids.alice, title: '通用备用简历', job: '前端 / 全栈', status: 'draft',
      skills: ['Vue3', 'React', 'Node.js'],
      exps: [
        { org: '个人开源项目', role: '作者', s: '2025-01', e: '2025-06', desc: '维护一个基于 Vue3 的组件库，收获 180 star。', hl: ['开源组件库获 180 star，合并 20+ 外部 PR。'] },
      ] },
    { uid: ids.bob, title: '课程助教申请简历', job: '高等数学助教', status: 'final',
      skills: ['高等数学', '线性代数', '讲解能力', '板书'],
      exps: [
        { org: '高数辅导课', role: '主讲', s: '2025-03', e: '2025-06', desc: '每周为低年级同学开设习题课，累计 16 场。', hl: ['累计主讲 16 场习题课，覆盖 120 余名同学。', '期末学员平均分高出年级均分 8 分。'] },
        { org: '学院学习部', role: '学业帮扶志愿者', s: '2024-09', e: '2025-01', desc: '一对一帮扶 3 名学业预警同学。', hl: ['帮扶 3 名同学全部通过期末考核。'] },
        { org: '数学竞赛集训队', role: '队员', s: '2024-03', e: '2024-06', desc: '参加校级数学竞赛并获三等奖。', hl: ['校级数学竞赛三等奖。'] },
      ] },
    { uid: ids.bob, title: '英语助教简历', job: '英语口语助教', status: 'polished',
      skills: ['雅思 7.0', '口语', '英语写作'],
      exps: [
        { org: '英语角', role: '组织者', s: '2025-02', e: '2025-07', desc: '每周组织英语角活动，设计话题与讨论流程。', hl: ['组织 20 期英语角，累计参与 400 人次。'] },
        { org: '校英语演讲比赛', role: '参赛者', s: '2024-11', e: '2024-11', desc: '以"终身学习"为主题参赛，获二等奖。', hl: ['校英语演讲比赛二等奖。'] },
      ] },
    { uid: ids.bob, title: '实习简历（备用）', job: '后端开发实习生', status: 'draft',
      skills: ['Node.js', 'Express', 'SQLite'],
      exps: [
        { org: '课程项目', role: '后端开发', s: '2025-04', e: '2025-06', desc: '实现 REST API 与 JWT 鉴权。', hl: [] },
        { org: '校园二手交易平台', role: '后端负责人', s: '2025-01', e: '2025-03', desc: '负责订单与消息模块的接口设计与实现。', hl: ['设计订单状态机，覆盖 6 种状态流转。'] },
      ] },
    { uid: ids.carol, title: '保研夏令营简历', job: '计算机视觉方向', status: 'polished',
      skills: ['Python', 'PyTorch', '对比学习', '论文精读'],
      exps: [
        { org: '计算机视觉实验室', role: '本科实习生', s: '2024-10', e: '2025-08', desc: '研究对比学习在少样本场景的应用，完成两轮完整实验。', hl: ['在 5 个少样本数据集上完成基线复现，误差控制在 1% 内。', '提出一种轻量负样本采样策略，训练时间减少 25%。'] },
        { org: '校级科研训练计划', role: '项目负责人', s: '2024-03', e: '2024-12', desc: '主持图像分类课题，结题评定为优秀。', hl: ['主持项目结题评定为优秀（前 10%）。'] },
        { org: '学术会议志愿工作', role: '会务志愿者', s: '2025-05', e: '2025-05', desc: '协助组织校级学术会议，负责分会场记录。', hl: ['完成 4 场分会场的会议记录整理。'] },
      ] },
    { uid: ids.carol, title: '通用申请简历', job: '算法工程师', status: 'draft',
      skills: ['Python', 'C++', '深度学习'],
      exps: [
        { org: '算法课程项目', role: '开发者', s: '2025-03', e: '2025-05', desc: '实现图像分类模型并做剪枝加速。', hl: [] },
        { org: '数据结构课程助教', role: '助教', s: '2024-09', e: '2025-01', desc: '负责作业批改与上机答疑。', hl: ['批改 6 次作业，累计答疑 80 余人次。'] },
      ] },
  ];

  if (count('resumes') === 0) {
    const insR = db.prepare(
      'INSERT INTO resumes (user_id, title, target_job, skills, experiences, status, polished, finalized_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
    );
    const insE = db.prepare(
      'INSERT INTO resume_experiences (resume_id, org, role, start_date, end_date, description, highlights, sort_order, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
    );
    resumeSpec.forEach((r, i) => {
      const created = dayOffset(16 - i);
      const updated = dayOffset(Math.max(1, 12 - i));
      const polished = r.status === 'draft' ? '' : [
        `求职意向：${r.job}`,
        `核心技能：${r.skills.join('、')}`,
        '实习与项目经历：',
        ...r.exps.map((e) => `· ${e.org} · ${e.role} · ${e.s}–${e.e}\n${(e.hl || []).map((h) => '  - ' + h).join('\n')}`),
      ].join('\n');
      const info = insR.run(
        r.uid, r.title, r.job, JSON.stringify(r.skills), '[]',
        r.status, polished,
        r.status === 'final' ? updated : '',
        created, updated
      );
      const rid = info.lastInsertRowid;
      r.exps.forEach((e, si) => {
        insE.run(rid, e.org, e.role, e.s, e.e, e.desc, JSON.stringify(e.hl || []), si, created);
      });
    });
  }

  // ============ 5) 任务：35 个 ============
  const taskSpec = [
    [ids.alice, 0, '完成数据结构大作业', 'high', 1, 0],
    [ids.alice, 0, '复习复变函数第四章', 'medium', 4, 1],
    [ids.alice, 0, '做完图论章节习题 1-15', 'medium', 2, 0],
    [ids.alice, 0, '整理最短路径算法对比表', 'low', 6, 1],
    [ids.alice, 1, '投递暑假实习简历', 'high', 3, 0],
    [ids.alice, 1, '准备二面项目讲述稿', 'high', 5, 0],
    [ids.alice, 1, '刷 20 道手写题', 'medium', 7, 1],
    [ids.alice, 1, '更新简历中的量化数据', 'medium', 9, 0],
    [ids.alice, 2, '精读注意力机制论文', 'high', 2, 1],
    [ids.alice, 2, '复现一个小实验', 'medium', 8, 0],
    [ids.alice, 2, '整理实验数据记录模板', 'low', 12, 1],
    [ids.alice, 2, '读三篇对比学习相关文献', 'medium', 11, 0],
    [ids.bob, 3, '背 50 个雅思核心词', 'medium', 2, 1],
    [ids.bob, 3, '写一篇大作文并批改', 'high', 3, 0],
    [ids.bob, 3, '精听 3 段剑桥听力', 'medium', 5, 1],
    [ids.bob, 3, '整理口语 Part 2 素材', 'medium', 7, 0],
    [ids.bob, 3, '完成一套阅读真题', 'high', 6, 1],
    [ids.bob, 3, '复盘写作常见语法错误', 'low', 10, 0],
    [ids.bob, 4, '准备助教试讲', 'high', 4, 0],
    [ids.bob, 4, '整理答疑常见问题文档', 'medium', 8, 1],
    [ids.bob, 4, '批改第一次作业', 'high', 9, 0],
    [ids.bob, 4, '设计递进难度例题', 'low', 13, 1],
    [ids.carol, 5, '完成毕业设计开题报告', 'high', 2, 0],
    [ids.carol, 5, '复现 SimCLR 基线', 'high', 6, 0],
    [ids.carol, 5, '搭建实验环境（CUDA + PyTorch）', 'medium', 5, 1],
    [ids.carol, 5, '整理文献综述初稿', 'medium', 8, 0],
    [ids.carol, 5, '跑通数据增强消融实验', 'high', 10, 0],
    [ids.carol, 5, '与导师汇报进展', 'medium', 7, 1],
    [ids.carol, 5, '整理实验日志', 'low', 14, 1],
    [ids.admin, 0, '初始化项目演示数据', 'medium', 4, 1],
    [ids.admin, 0, '审查权限接口', 'high', 6, 1],
    [ids.admin, 0, '补充后端测试用例', 'high', 3, 0],
    [ids.admin, 0, '优化前端加载性能', 'medium', 9, 0],
    [ids.admin, 0, '编写部署文档', 'low', 13, 1],
    [ids.admin, 0, '巡检线上日志', 'low', 15, 1],
  ];
  if (count('tasks') === 0) {
    const ins = db.prepare(
      'INSERT INTO tasks (user_id, project_id, title, project, priority, due_date, done, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)'
    );
    taskSpec.forEach((t, i) => {
      const [uid, pi, title, priority, dueDays, done] = t;
      const list = proj[uid === ids.alice ? 'alice' : uid === ids.bob ? 'bob' : uid === ids.carol ? 'carol' : 'admin'];
      const p = list[pi];
      const created = dayOffset(14 - (i % 14));
      ins.run(uid, p ? p.id : null, title, p ? p.name : '默认项目', priority, dateOnly(-dueDays), done, created, dayOffset(Math.max(0, 12 - (i % 13))));
    });
  }

  // ============ 6) 附件：若干 ============
  if (count('attachments') === 0) {
    const someNotes = db.prepare('SELECT id, user_id, title FROM notes ORDER BY id LIMIT 10').all();
    const ins = db.prepare('INSERT INTO attachments (user_id, note_id, filename, mime, size, created_at) VALUES (?,?,?,?,?,?)');
    const files = [
      ['讲义-图论.pdf', 'application/pdf', 482133],
      ['作业模板.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 32104],
      ['数据样例.csv', 'text/csv', 20481],
      ['参考论文.pdf', 'application/pdf', 1245092],
    ];
    someNotes.forEach((n, i) => {
      const f = files[i % files.length];
      ins.run(n.user_id, n.id, f[0], f[1], f[2], dayOffset(10 - (i % 9)));
    });
  }

  // ============ 7) 活动流：30 条，跨 14 天 ============
  if (count('activities') === 0) {
    const templates = [
      ['create', 'note', '新建笔记「%s」'],
      ['update', 'note', '编辑笔记「%s」'],
      ['polish', 'resume', 'AI 润色了简历「%s」'],
      ['create', 'task', '新建任务「%s」'],
      ['complete', 'task', '完成任务「%s」'],
      ['create', 'project', '创建了项目「%s」'],
      ['apply', 'resume', '把润色亮点应用到「%s」原稿'],
      ['rollback', 'note', '回滚笔记「%s」到历史版本'],
    ];
    const ins = db.prepare('INSERT INTO activities (user_id, type, target_type, target_id, summary, meta, created_at) VALUES (?,?,?,?,?,?,?)');
    const byUser = (uid, table, limit) => {
      const nameCol = table === 'projects' ? 'name' : 'title';
      return db.prepare(`SELECT id, ${nameCol} AS name FROM ${table} WHERE user_id=? ORDER BY id LIMIT ?`).all(uid, limit);
    };
    const users = [ids.alice, ids.bob, ids.carol, ids.admin];
    const TOTAL = 30;
    const SPAN = 14; // 覆盖最近 14 天（d = 0..13），保证时间线有厚度
    for (let i = 0; i < TOTAL; i++) {
      const d = i % SPAN;
      const uid = users[i % users.length];
      const tpl = templates[i % templates.length];
      const table = tpl[1] === 'note' ? 'notes' : tpl[1] === 'resume' ? 'resumes' : tpl[1] === 'task' ? 'tasks' : 'projects';
      const pool = byUser(uid, table, 6);
      if (!pool.length) continue;
      const target = pool[i % pool.length];
      ins.run(uid, tpl[0], tpl[1], target.id, tpl[2].replace('%s', target.name), JSON.stringify({ seed: true }), dayOffset(d, 9 + (i % 9)));
    }
  }

  // ---------- 汇总 ----------
  const tables = ['users', 'projects', 'notes', 'note_versions', 'tags', 'note_tags', 'resumes', 'resume_experiences', 'tasks', 'attachments', 'activities'];
  console.log('✅ Seed 完成（幂等：重复执行不会重复插入，也不会清空已有数据）。');
  console.log('   表数量: ' + tables.length + ' → ' + tables.join(', '));
  console.log('   数据量: ' + tables.map((t) => `${t}=${count(t)}`).join('  '));
  console.log('   管理员账号: admin / admin123');
  console.log('   演示用户: alice、bob、carol  密码均为 123456');
  console.log(`   数据库文件: ${process.env.DB_PATH || './data/scholarboard.db'}`);
}

module.exports = seed;

if (require.main === module) {
  seed();
}
