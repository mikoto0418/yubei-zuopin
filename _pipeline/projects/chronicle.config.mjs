// Chronicle · 个人成长档案 —— 时间轴形态 + Chakra UI
export default {
  key: 'chronicle',
  name: 'Chronicle',
  tagline: '个人成长档案与里程碑记录',
  port: 4205,
  backend: 'node',
  frontend: 'react',
  form: 'timeline',
  ui: 'chakra',

  userColumns: [
    { name: 'school', type: "TEXT DEFAULT ''", demoAdmin: '计算机学院' },
  ],

  entities: [
    {
      table: 'events',
      label: '成长事件',
      columns: [
        { name: 'user_id', type: 'INTEGER NOT NULL' },
        { name: 'title', type: 'TEXT NOT NULL' },
        { name: 'category', type: "TEXT DEFAULT '学习'" },
        { name: 'content', type: "TEXT DEFAULT ''" },
        { name: 'impact', type: "TEXT DEFAULT ''" },
        { name: 'tags', type: "TEXT DEFAULT ''" },
        { name: 'occurred_on', type: 'TEXT NOT NULL' },
        { name: 'pinned', type: 'INTEGER DEFAULT 0' },
        { name: 'created_at', type: "TEXT DEFAULT (datetime('now','localtime'))" },
      ],
      required: ['title', 'occurred_on'],
      searchable: ['title', 'content', 'tags'],
      filterable: ['category'],
    },
    {
      table: 'attachments',
      label: '附件',
      columns: [
        { name: 'user_id', type: 'INTEGER NOT NULL' },
        { name: 'event_id', type: 'INTEGER NOT NULL' },
        { name: 'name', type: "TEXT DEFAULT ''" },
        { name: 'url', type: "TEXT DEFAULT ''" },
        { name: 'created_at', type: "TEXT DEFAULT (datetime('now','localtime'))" },
      ],
      required: ['event_id', 'name'],
      filterable: ['event_id'],
    },
    {
      table: 'reflections',
      label: '阶段复盘',
      columns: [
        { name: 'user_id', type: 'INTEGER NOT NULL' },
        { name: 'period', type: "TEXT DEFAULT ''" },
        { name: 'highlights', type: "TEXT DEFAULT ''" },
        { name: 'lessons', type: "TEXT DEFAULT ''" },
        { name: 'next_goals', type: "TEXT DEFAULT ''" },
        { name: 'created_at', type: "TEXT DEFAULT (datetime('now','localtime'))" },
      ],
      required: ['period'],
      searchable: ['period', 'highlights', 'lessons'],
    },
  ],

  indexes: [
    'idx_events_occurred ON events(occurred_on)',
    'idx_events_category ON events(category)',
    'idx_attachments_event ON attachments(event_id)',
  ],

  ai: {
    routes: [
      {
        path: 'narrative',
        label: 'AI 成长叙事',
        system: '你是传记作家。根据用户的时间轴事件，写一段有温度、有脉络的成长叙事，突出转折点与成长轨迹。中文，300 字以内。',
        localBody: `    const events = input.events || [];
    const buildLocal = () => {
      if (!events.length) return '还没有记录任何事件，先去时间轴添加第一条吧。';
      const sorted = [...events].sort((a, b) => String(a.occurred_on).localeCompare(String(b.occurred_on)));
      const first = sorted[0], last = sorted[sorted.length - 1];
      const cats = {};
      events.forEach((e) => { cats[e.category] = (cats[e.category] || 0) + 1; });
      const catText = Object.entries(cats).map(([k, v]) => \`\${k} \${v} 项\`).join('、');
      return [
        \`从 \${first.occurred_on} 到 \${last.occurred_on}，这段历程共记录了 \${events.length} 个重要节点。\`,
        '',
        \`期间覆盖 \${catText}。\`,
        '',
        \`起点是"\${first.title}"，最新的节点是"\${last.title}"。每一个记录，都是成长留下的脚印。\`,
      ].join('\\n');
    };`,
      },
      {
        path: 'review',
        label: 'AI 阶段复盘',
        system: '你是成长教练。根据用户这段时间的事件，总结收获、指出不足、给出下阶段可执行的建议。中文，分三部分输出。',
        localBody: `    const events = input.events || [];
    const period = input.period || '本阶段';
    const buildLocal = () => {
      const byCat = {};
      events.forEach((e) => { (byCat[e.category] = byCat[e.category] || []).push(e.title); });
      const lines = ['## 收获', ''];
      Object.entries(byCat).forEach(([cat, titles]) => {
        lines.push(\`- **\${cat}**（\${titles.length} 项）：\${titles.slice(0, 2).join('、')}\`);
      });
      lines.push('', '## 待提升', '', '- 记录的连续性可以加强，建议保持每周至少一条', '- 部分事件缺少复盘反思，可补充"影响"字段');
      lines.push('', '## 下阶段建议', '', '1. 为每个领域设定一个可量化的小目标', '2. 每月做一次阶段复盘', '3. 重要节点及时补充附件与心得');
      return \`# \${period}复盘\\n\\n\${lines.join('\\n')}\`;
    };`,
      },
    ],
  },

  accounts: {
    demo: [
      { username: 'student', password: 'student123', nickname: '小林' },
      { username: 'graduate', password: 'graduate123', nickname: '小陈' },
    ],
  },

  seedCode: `  // 成长事件（跨年份，覆盖多类型）
  const insE = db.prepare('INSERT INTO events (user_id,title,category,content,impact,tags,occurred_on,pinned) VALUES (?,?,?,?,?,?,?,?)');
  const events = [
    ['入学第一课：计算机导论', '学习', '第一次接触编程，写下第一行 Hello World。老师讲了计算机的发展史，第一次意识到这门学科有多广阔。', '确立了专业方向', '入门,启蒙', '2023-09-05', 1],
    ['加入 ACM 集训队', '项目', '通过选拔进入校 ACM 集训队，开始系统性刷题。前两个月几乎每天在机房待到闭馆。', '算法能力大幅提升', '算法,竞赛', '2023-11-12', 1],
    ['蓝桥杯省赛一等奖', '荣誉', '第一次参加正式比赛就拿到省一，非常意外。赛后复盘发现自己强在细节，弱在思维速度。', '增强了竞赛信心', '竞赛,获奖', '2024-04-13', 1],
    ['第一次做完整项目：校园二手平台', '项目', '从前端到后端独立完成，踩了很多坑：跨域、鉴权、分页。项目虽小，但第一次体会到工程化的复杂。', '掌握全栈开发流程', '全栈,实践', '2024-06-20', 0],
    ['暑期实习：某互联网公司前端岗', '实习', '第一次进入真实工业环境。学会了 Git 协作、代码评审、敏捷开发。导师的一句"先跑通再优化"影响我至今。', '理解工业级开发', '实习,工程', '2024-07-15', 1],
    ['天梯赛团体赛省三等奖', '荣誉', '团队赛考验配合，我们三人分工明确但最后一道题没来得及提交。遗憾，但学会了团队协作。', '认识团队配合的价值', '竞赛,团队', '2025-03-22', 0],
    ['担任 ACM 集训队队长', '里程碑', '从队员到队长，开始负责新人培训与比赛组织。第一次体会到"教会别人"比"自己会"更难。', '锻炼领导与表达能力', '领导,责任', '2025-09-01', 1],
    ['计算机设计大赛省一等奖', '荣誉', '带队做的智能学习助手项目获奖。从选题、开发到答辩，全程主导。答辩时被评委问到架构设计的取舍，答得不够好。', '验证了项目能力', '竞赛,获奖', '2025-05-18', 1],
    ['保研成功：本校计算机学院', '里程碑', '三年的努力有了结果。拿到保研资格那一刻，反而很平静，因为知道这只是新的开始。', '开启研究生阶段', '学业,转折', '2025-09-28', 1],
    ['开源项目首次被合并', '项目', '给一个常用的开源库提了 PR 修复文档错误，被维护者合并。第一次参与开源社区，很兴奋。', '接触开源协作', '开源,贡献', '2026-01-14', 0],
    ['发表第一篇会议论文', '里程碑', '研究生阶段的第一篇论文被领域会议接收。过程很煎熬，改了七稿，但学到了严谨的研究方法。', '建立科研基础', '科研,论文', '2026-06-30', 1],
    ['带的学弟拿到省赛二等奖', '里程碑', '作为队长带的学弟在省赛获奖，比自己得奖还开心。意识到传承的意义。', '体会到传承价值', '领导,传承', '2026-08-20', 0],
  ];
  const eids = events.map((e) => insE.run(adminId, ...e).lastInsertRowid);

  // 附件
  const insA = db.prepare('INSERT INTO attachments (user_id,event_id,name,url) VALUES (?,?,?,?)');
  insA.run(adminId, eids[2], '蓝桥杯获奖证书.jpg', '/certs/lanqiao.jpg');
  insA.run(adminId, eids[7], '计算机设计大赛证书.jpg', '/certs/design.jpg');
  insA.run(adminId, eids[4], '实习证明.pdf', '/certs/intern.pdf');
  insA.run(adminId, eids[10], '论文接收邮件.png', '/certs/paper.png');

  // 阶段复盘
  const insR = db.prepare('INSERT INTO reflections (user_id,period,highlights,lessons,next_goals) VALUES (?,?,?,?,?)');
  insR.run(adminId, '2024 学年',
    '拿到蓝桥杯省一；完成第一个全栈项目；进入大厂实习',
    '刷题不能只求数量，要重视思维训练；工程项目要重视文档',
    '提升算法思维速度；系统学习后端架构；准备保研材料');
  insR.run(adminId, '2025 学年',
    '担任 ACM 队长；计算机设计大赛省一；保研成功',
    '带队比单打独斗难得多，沟通成本常常被低估；答辩要练',
    '做好研究生阶段过渡；保持刷题手感；尝试开源贡献');`,
};
