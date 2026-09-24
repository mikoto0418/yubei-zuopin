// InterviewGo · AI 面试陪练 —— 对话流形态 + MUI
export default {
  key: 'interviewgo',
  name: 'InterviewGo',
  tagline: 'AI 模拟面试与能力评估',
  port: 4203,
  backend: 'node',
  frontend: 'react',
  form: 'chat',
  ui: 'mui',

  userColumns: [
    { name: 'target_role', type: "TEXT DEFAULT ''", demoAdmin: '面试官' },
  ],

  entities: [
    {
      table: 'sessions',
      label: '面试会话',
      columns: [
        { name: 'user_id', type: 'INTEGER NOT NULL' },
        { name: 'title', type: 'TEXT NOT NULL' },
        { name: 'role', type: "TEXT DEFAULT '前端工程师'" },
        { name: 'level', type: "TEXT DEFAULT '初级'" },
        { name: 'status', type: "TEXT DEFAULT '进行中'" },
        { name: 'score', type: 'INTEGER DEFAULT 0' },
        { name: 'round_count', type: 'INTEGER DEFAULT 0' },
        { name: 'created_at', type: "TEXT DEFAULT (datetime('now','localtime'))" },
      ],
      required: ['title'],
      searchable: ['title', 'role'],
      filterable: ['status', 'level'],
    },
    {
      table: 'messages',
      label: '对话消息',
      columns: [
        { name: 'user_id', type: 'INTEGER NOT NULL' },
        { name: 'session_id', type: 'INTEGER NOT NULL' },
        { name: 'role', type: "TEXT DEFAULT 'user'" },
        { name: 'content', type: "TEXT DEFAULT ''" },
        { name: 'card_type', type: "TEXT DEFAULT ''" },
        { name: 'created_at', type: "TEXT DEFAULT (datetime('now','localtime'))" },
      ],
      required: ['session_id', 'content'],
      filterable: ['session_id', 'role'],
    },
    {
      table: 'reports',
      label: '评估报告',
      columns: [
        { name: 'user_id', type: 'INTEGER NOT NULL' },
        { name: 'session_id', type: 'INTEGER NOT NULL' },
        { name: 'overall', type: 'INTEGER DEFAULT 0' },
        { name: 'logic', type: 'INTEGER DEFAULT 0' },
        { name: 'depth', type: 'INTEGER DEFAULT 0' },
        { name: 'expression', type: 'INTEGER DEFAULT 0' },
        { name: 'summary', type: "TEXT DEFAULT ''" },
        { name: 'suggestions', type: "TEXT DEFAULT ''" },
        { name: 'created_at', type: "TEXT DEFAULT (datetime('now','localtime'))" },
      ],
      required: ['session_id'],
      filterable: ['session_id'],
    },
  ],

  indexes: [
    'idx_messages_session ON messages(session_id)',
    'idx_sessions_status ON sessions(status)',
    'idx_reports_session ON reports(session_id)',
  ],

  ai: {
    routes: [
      {
        path: 'ask',
        label: 'AI 出题与追问',
        system: '你是一位资深技术面试官。根据候选人的目标岗位、级别和上一轮回答，提出下一个面试问题。一次只问一个问题，简洁专业。若上一轮回答有可追问点，优先深挖。',
        localBody: `    const role = input.role || '前端工程师';
    const level = input.level || '初级';
    const round = Number(input.round) || 1;
    const bank = {
      前端工程师: ['请解释浏览器的事件循环机制，宏任务与微任务的区别是什么？', 'React 的 useEffect 依赖数组为空、不写、写具体值，三种情况分别意味着什么？', '如何优化一个首屏加载 3 秒的页面？请给出具体手段和预期收益。', 'HTTP 缓存中强缓存与协商缓存的区别，各自对应哪些响应头？', '前端如何做错误监控？window.onerror 能捕获哪些错误？'],
      后端工程师: ['数据库索引为什么能加速查询？什么情况下索引会失效？', '如何设计一个高并发场景下的秒杀系统？', '分布式事务有哪些解决方案？各自适用场景是什么？', 'Redis 缓存穿透、击穿、雪崩分别是什么，如何应对？', '如何排查线上接口响应慢的问题？'],
      产品经理: ['如何判断一个需求该不该做？你的优先级框架是什么？', '举例说明你如何用数据驱动一次产品迭代。', '面对研发资源不足，你如何做取舍？', '如何设计一个新用户引导流程？关键指标是什么？'],
      数据分析师: ['如何判断一次 A/B 测试的结果是否显著？', '用户流失分析你会从哪些维度切入？', 'SQL 中 window function 的典型使用场景有哪些？', '如何设计一套指标体系来衡量业务健康度？'],
    };
    const questions = bank[role] || bank['前端工程师'];
    const buildLocal = () => questions[(round - 1) % questions.length];`,
      },
      {
        path: 'evaluate',
        label: 'AI 评估报告',
        system: '你是面试评估专家。根据完整对话记录，对候选人做出结构化评估：逻辑性、专业深度、表达清晰度各 0-100 分，给出总评与三条具体改进建议。用 JSON 返回：{"logic":n,"depth":n,"expression":n,"overall":n,"summary":"...","suggestions":["...","...","..."]}。',
        localBody: `    const msgs = input.messages || [];
    const answers = msgs.filter((m) => m.role === 'user');
    const avgLen = answers.length ? answers.reduce((s, m) => s + (m.content || '').length, 0) / answers.length : 0;
    const logic = Math.min(95, 55 + answers.length * 4);
    const depth = Math.min(92, 50 + Math.round(avgLen / 8));
    const expression = Math.min(94, 58 + Math.round(avgLen / 10));
    const overall = Math.round((logic + depth + expression) / 3);
    const buildLocal = () => JSON.stringify({
      logic, depth, expression, overall,
      summary: \`本次面试共 \${answers.length} 轮问答，回答平均长度 \${Math.round(avgLen)} 字。整体表现\${overall >= 80 ? '优秀' : overall >= 65 ? '良好' : '有待提升'}。\`,
      suggestions: [
        '回答时先给结论，再展开论据，避免绕圈子',
        '多用具体项目经历支撑观点，减少泛泛而谈',
        '遇到不会的问题，说明思路边界比直接放弃更好',
      ],
    }, null, 2);`,
      },
    ],
  },

  accounts: {
    demo: [
      { username: 'candidate', password: 'candidate123', nickname: '张同学' },
      { username: 'jobseeker', password: 'jobseeker123', nickname: '刘同学' },
    ],
  },

  seedCode: `  // 面试会话 + 对话 + 报告
  const insS = db.prepare('INSERT INTO sessions (user_id,title,role,level,status,score,round_count) VALUES (?,?,?,?,?,?,?)');
  const sid = insS.run(adminId, '前端工程师模拟面试', '前端工程师', '中级', '已完成', 78, 5).lastInsertRowid;
  const sid2 = insS.run(adminId, '后端工程师模拟面试', '后端工程师', '初级', '进行中', 0, 2).lastInsertRowid;

  const insM = db.prepare('INSERT INTO messages (user_id,session_id,role,content,card_type) VALUES (?,?,?,?,?)');
  insM.run(adminId, sid, 'ai', '你好，我是本次面试的面试官。我们开始吧——请先简单介绍一下你自己，重点讲讲最近一个你主导的项目。', '');
  insM.run(adminId, sid, 'user', '我有三年前端经验，最近主导了公司后台管理系统的重构，把 Vue2 迁移到 Vue3，同时引入了 Vite 构建，首屏加载从 4.2 秒降到 1.6 秒。', '');
  insM.run(adminId, sid, 'ai', '不错，数据很具体。那我想追问一下：迁移过程中你遇到的最大阻碍是什么？你是怎么解决的？', '');
  insM.run(adminId, sid, 'user', '最大的问题是旧代码里有大量依赖 Vue2 语法的第三方组件，无法直接升级。我的方案是先用兼容层过渡，同时并行改造高频使用的组件，分三期完成。', '');
  insM.run(adminId, sid, 'ai', '很好的工程化思路。接下来问个技术细节：请解释浏览器的事件循环机制，宏任务与微任务的区别是什么？', '');
  insM.run(adminId, sid, 'user', '事件循环是 JS 处理异步的机制。同步代码在主线程执行，异步任务分宏任务和微任务。每次宏任务执行完，会清空所有微任务队列，然后再取下一个宏任务。Promise 的回调是微任务，setTimeout 是宏任务。', '');
  insM.run(adminId, sid, 'ai', '回答正确。最后一个问题：如何优化一个首屏加载 3 秒的页面？', '');
  insM.run(adminId, sid, 'user', '可以从几个方面：路由懒加载、图片压缩和懒加载、开启 gzip/brotli、CDN 加速静态资源、服务端渲染或预渲染关键页面、减少首屏不必要的 JS。', '');

  insM.run(adminId, sid2, 'ai', '你好，我们开始后端工程师的面试。请谈谈你对数据库索引的理解。', '');
  insM.run(adminId, sid2, 'user', '索引就像书的目录，能快速定位数据。B+ 树是最常用的索引结构，因为它的叶子节点形成链表，适合范围查询。', '');

  const insR = db.prepare('INSERT INTO reports (user_id,session_id,overall,logic,depth,expression,summary,suggestions) VALUES (?,?,?,?,?,?,?,?)');
  insR.run(adminId, sid, 78, 82, 74, 79,
    '本次面试共 4 轮问答，整体表现良好。候选人项目经验扎实，能用具体数据支撑观点，工程化思路清晰；技术原理题回答准确但深度一般，可进一步展开。',
    '回答技术原理时，可补充底层实现或源码层面的细节，体现深度；\\n介绍项目时，可多用"问题-方案-结果"结构，让表达更有说服力；\\n可以主动追问面试官关注点，展现沟通意愿。');`,
};
