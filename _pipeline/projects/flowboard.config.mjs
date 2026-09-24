// FlowBoard · 敏捷项目协作 —— 看板形态 + shadcn/ui
export default {
  key: 'flowboard',
  name: 'FlowBoard',
  tagline: '敏捷项目协作与缺陷跟踪',
  port: 4201,
  backend: 'node',
  frontend: 'react',
  form: 'board',
  ui: 'shadcn',

  userColumns: [
    { name: 'job_title', type: "TEXT DEFAULT ''", demoAdmin: '工程效能负责人' },
  ],

  entities: [
    {
      table: 'projects',
      label: '项目',
      columns: [
        { name: 'user_id', type: 'INTEGER NOT NULL' },
        { name: 'name', type: 'TEXT NOT NULL' },
        { name: 'key', type: "TEXT DEFAULT ''" },
        { name: 'description', type: "TEXT DEFAULT ''" },
        { name: 'color', type: "TEXT DEFAULT '#6366f1'" },
        { name: 'archived', type: 'INTEGER DEFAULT 0' },
        { name: 'created_at', type: "TEXT DEFAULT (datetime('now','localtime'))" },
      ],
      required: ['name'],
      searchable: ['name', 'description'],
    },
    {
      table: 'issues',
      label: '工作项',
      columns: [
        { name: 'user_id', type: 'INTEGER NOT NULL' },
        { name: 'project_id', type: 'INTEGER NOT NULL' },
        { name: 'title', type: 'TEXT NOT NULL' },
        { name: 'description', type: "TEXT DEFAULT ''" },
        { name: 'status', type: "TEXT DEFAULT 'backlog'" },
        { name: 'priority', type: "TEXT DEFAULT 'medium'" },
        { name: 'assignee', type: "TEXT DEFAULT ''" },
        { name: 'story_points', type: 'INTEGER DEFAULT 0' },
        { name: 'due_date', type: "TEXT DEFAULT ''" },
        { name: 'position', type: 'INTEGER DEFAULT 0' },
        { name: 'created_at', type: "TEXT DEFAULT (datetime('now','localtime'))" },
      ],
      required: ['title', 'project_id'],
      searchable: ['title', 'description', 'assignee'],
      filterable: ['status', 'priority', 'project_id'],
    },
    {
      table: 'comments',
      label: '评论',
      columns: [
        { name: 'user_id', type: 'INTEGER NOT NULL' },
        { name: 'issue_id', type: 'INTEGER NOT NULL' },
        { name: 'body', type: "TEXT DEFAULT ''" },
        { name: 'created_at', type: "TEXT DEFAULT (datetime('now','localtime'))" },
      ],
      required: ['issue_id', 'body'],
      filterable: ['issue_id'],
    },
  ],

  indexes: [
    'idx_issues_project ON issues(project_id)',
    'idx_issues_status ON issues(status)',
    'idx_issues_priority ON issues(priority)',
    'idx_comments_issue ON comments(issue_id)',
  ],

  ai: {
    routes: [
      {
        path: 'breakdown',
        label: 'AI 任务拆解',
        system: '你是敏捷项目专家。把用户给出的需求拆成可执行的子任务，每条包含标题、优先级(high/medium/low)和工作量点数。用 JSON 数组返回，不要多余解释。',
        localBody: `    const requirement = input.requirement || '该需求';
    const buildLocal = () => JSON.stringify([
      { title: \`\${requirement}：梳理需求与验收标准\`, priority: 'high', story_points: 3 },
      { title: \`\${requirement}：接口设计与数据建模\`, priority: 'high', story_points: 5 },
      { title: \`\${requirement}：核心逻辑实现\`, priority: 'medium', story_points: 8 },
      { title: \`\${requirement}：单元测试与联调\`, priority: 'medium', story_points: 3 },
      { title: \`\${requirement}：文档与演示准备\`, priority: 'low', story_points: 2 },
    ], null, 2);`,
      },
      {
        path: 'standup',
        label: 'AI 站会摘要',
        system: '你是敏捷教练。根据工作项数据生成简洁的每日站会摘要：已完成、进行中、阻塞项、建议。中文，分点输出。',
        localBody: `    const items = input.issues || [];
    const by = (s) => items.filter((i) => i.status === s);
    const buildLocal = () => [
      \`## 站会摘要\`,
      \`- 待办 \${by('backlog').length} 项，进行中 \${by('in_progress').length} 项，待评审 \${by('review').length} 项，已完成 \${by('done').length} 项\`,
      by('in_progress').length ? \`- 当前焦点：\${by('in_progress').slice(0, 3).map((i) => i.title).join('；')}\` : '- 当前无进行中事项',
      by('done').length ? \`- 近期完成：\${by('done').slice(0, 3).map((i) => i.title).join('；')}\` : '- 暂无完成项',
      '- 建议：优先推进高优先级且临近截止的工作项',
    ].join('\\n');`,
      },
    ],
  },

  accounts: {
    demo: [
      { username: 'lina', password: 'lina123', nickname: '李娜' },
      { username: 'chenwei', password: 'chenwei123', nickname: '陈伟' },
    ],
  },

  seedCode: `  // 项目 + 工作项演示数据
  const insProject = db.prepare('INSERT INTO projects (user_id,name,key,description,color) VALUES (?,?,?,?,?)');
  const pid = insProject.run(adminId, '支付网关重构', 'PAY', '把旧的支付链路迁移到新网关，支持多渠道路由与灰度', '#6366f1').lastInsertRowid;
  const pid2 = insProject.run(adminId, '移动端性能优化', 'MOB', '首屏加载从 3.2s 降到 1.5s 以内', '#f59e0b').lastInsertRowid;

  const insIssue = db.prepare('INSERT INTO issues (user_id,project_id,title,description,status,priority,assignee,story_points,position) VALUES (?,?,?,?,?,?,?,?,?)');
  const seedIssues = [
    [pid, '设计渠道路由表结构', '支持按金额/地区/渠道优先级路由', 'done', 'high', '李娜', 5],
    [pid, '实现支付宝渠道适配器', '封装 SDK，处理异步回调验签', 'done', 'high', '陈伟', 8],
    [pid, '实现微信支付适配器', '含退款与对账文件解析', 'in_progress', 'high', '李娜', 8],
    [pid, '灰度开关与降级策略', '按用户 ID 百分比放量，异常自动回切', 'in_progress', 'medium', '陈伟', 5],
    [pid, '对账任务定时化', '每日凌晨跑前一日对账并告警', 'review', 'medium', '李娜', 3],
    [pid, '压测方案与容量评估', '目标 2000 TPS，输出报告', 'backlog', 'medium', '', 5],
    [pid, '接入监控大盘', '成功率/耗时/错误码多维看板', 'backlog', 'low', '', 3],
    [pid2, '首屏资源懒加载', '路由级分包 + 图片懒加载', 'done', 'high', '陈伟', 5],
    [pid2, '接口响应体瘦身', '去掉冗余字段，开启 gzip', 'in_progress', 'medium', '李娜', 3],
    [pid2, '建立性能基线监控', 'LCP/FCP/TTI 上报与告警', 'backlog', 'medium', '', 5],
  ];
  seedIssues.forEach(([p, t, d, s, pr, a, sp], i) => insIssue.run(adminId, p, t, d, s, pr, a, sp, i));`,
};
