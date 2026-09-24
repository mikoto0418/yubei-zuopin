// Inkwell · 团队知识库写作 —— 编辑器优先形态 + Arco Design
export default {
  key: 'inkwell',
  name: 'Inkwell',
  tagline: '团队知识库与协作写作',
  port: 4204,
  backend: 'node',
  frontend: 'vue',
  form: 'editor',
  ui: 'arco',

  userColumns: [
    { name: 'team', type: "TEXT DEFAULT ''", demoAdmin: '内容组' },
  ],

  entities: [
    {
      table: 'spaces',
      label: '知识空间',
      columns: [
        { name: 'user_id', type: 'INTEGER NOT NULL' },
        { name: 'name', type: 'TEXT NOT NULL' },
        { name: 'icon', type: "TEXT DEFAULT '📘'" },
        { name: 'description', type: "TEXT DEFAULT ''" },
        { name: 'created_at', type: "TEXT DEFAULT (datetime('now','localtime'))" },
      ],
      required: ['name'],
      searchable: ['name', 'description'],
    },
    {
      table: 'docs',
      label: '文档',
      columns: [
        { name: 'user_id', type: 'INTEGER NOT NULL' },
        { name: 'space_id', type: 'INTEGER NOT NULL' },
        { name: 'title', type: 'TEXT NOT NULL' },
        { name: 'content', type: "TEXT DEFAULT ''" },
        { name: 'summary', type: "TEXT DEFAULT ''" },
        { name: 'status', type: "TEXT DEFAULT '草稿'" },
        { name: 'word_count', type: 'INTEGER DEFAULT 0' },
        { name: 'updated_at', type: "TEXT DEFAULT (datetime('now','localtime'))" },
        { name: 'created_at', type: "TEXT DEFAULT (datetime('now','localtime'))" },
      ],
      required: ['title', 'space_id'],
      searchable: ['title', 'content', 'summary'],
      filterable: ['space_id', 'status'],
    },
    {
      table: 'revisions',
      label: '版本记录',
      columns: [
        { name: 'user_id', type: 'INTEGER NOT NULL' },
        { name: 'doc_id', type: 'INTEGER NOT NULL' },
        { name: 'content', type: "TEXT DEFAULT ''" },
        { name: 'note', type: "TEXT DEFAULT ''" },
        { name: 'created_at', type: "TEXT DEFAULT (datetime('now','localtime'))" },
      ],
      required: ['doc_id'],
      filterable: ['doc_id'],
    },
  ],

  indexes: [
    'idx_docs_space ON docs(space_id)',
    'idx_docs_status ON docs(status)',
    'idx_revisions_doc ON revisions(doc_id)',
  ],

  ai: {
    routes: [
      {
        path: 'polish',
        label: 'AI 润色',
        system: '你是资深中文编辑。在保持原意的前提下润色文本：修正语病、优化措辞、调整节奏，使其更流畅专业。直接返回润色后的正文，不要解释。',
        localBody: `    const text = input.text || '';
    if (!text.trim()) return '请先输入需要润色的内容。';
    const polished = text
      .replace(/[ \\t]+/g, ' ')
      .replace(/。\\s*/g, '。\\n\\n')
      .replace(/，\\s*/g, '，')
      .replace(/\\n{3,}/g, '\\n\\n')
      .trim();
    const buildLocal = () => \`【润色稿】\\n\\n\${polished}\\n\\n—— 已优化标点节奏与段落分隔，保持原意不变。\`;`,
      },
      {
        path: 'outline',
        label: 'AI 生成大纲',
        system: '你是写作教练。根据主题生成一份结构清晰的文档大纲，含三级标题与每节要点。中文，Markdown 格式。',
        localBody: `    const topic = input.topic || '未命名主题';
    const buildLocal = () => [
      \`# \${topic}\`,
      '',
      '## 一、背景与目标',
      '- 现状说明',
      '- 要解决的问题',
      '- 预期达成的目标',
      '',
      '## 二、核心内容',
      '### 2.1 关键概念',
      '- 定义与范围',
      '- 与相关概念的区别',
      '### 2.2 实现路径',
      '- 步骤拆解',
      '- 关键决策点',
      '',
      '## 三、实践与案例',
      '- 典型案例',
      '- 常见问题与对策',
      '',
      '## 四、总结与展望',
      '- 要点回顾',
      '- 后续计划',
    ].join('\\n');`,
      },
      {
        path: 'summarize',
        label: 'AI 摘要',
        system: '你是信息提炼专家。用 2-3 句话概括文档核心内容，中文，突出结论与价值。',
        localBody: `    const content = (input.content || '').replace(/[#*>\`\\-]/g, '').trim();
    const buildLocal = () => {
      if (!content) return '文档为空，无法生成摘要。';
      const head = content.slice(0, 60).replace(/\\n/g, ' ');
      return \`本文围绕"\${head}..."展开，梳理了背景、核心要点与实践路径，并给出可落地的建议。全文共 \${content.length} 字。\`;
    };`,
      },
    ],
  },

  accounts: {
    demo: [
      { username: 'writer', password: 'writer123', nickname: '周编辑' },
      { username: 'author', password: 'author123', nickname: '吴作者' },
    ],
  },

  seedCode: `  // 知识空间 + 文档
  const insSp = db.prepare('INSERT INTO spaces (user_id,name,icon,description) VALUES (?,?,?,?)');
  const sp1 = insSp.run(adminId, '产品手册', '📘', '面向新用户的产品使用与最佳实践').lastInsertRowid;
  const sp2 = insSp.run(adminId, '工程规范', '⚙️', '团队开发约定与技术决策记录').lastInsertRowid;
  const sp3 = insSp.run(adminId, '运营素材', '📣', '活动文案与推广话术沉淀').lastInsertRowid;

  const insDoc = db.prepare('INSERT INTO docs (user_id,space_id,title,content,summary,status,word_count) VALUES (?,?,?,?,?,?,?)');
  const d1 = insDoc.run(adminId, sp1, '快速上手指南',
    '# 快速上手指南\\n\\n## 一、注册与登录\\n\\n访问平台首页，点击右上角"注册"，填写用户名与密码即可创建账号。已有账号直接登录。\\n\\n## 二、核心概念\\n\\n平台围绕"空间 - 文档 - 版本"三层组织内容：\\n\\n- **空间**：按主题聚合文档，如产品手册、工程规范\\n- **文档**：正文内容，支持 Markdown 与富文本\\n- **版本**：每次保存自动留痕，可回溯对比\\n\\n## 三、写作建议\\n\\n1. 先写大纲，再填内容\\n2. 一段一个观点，避免长段落\\n3. 善用 AI 润色与摘要，提升效率',
    '介绍平台的三层内容组织模型与写作流程，帮助新用户 5 分钟上手。', '已发布', 186).lastInsertRowid;
  const d2 = insDoc.run(adminId, sp2, '代码提交规范',
    '# 代码提交规范\\n\\n## 提交信息格式\\n\\n采用 Conventional Commits 规范：\\n\\ntype(scope): subject\\n\\n常用 type：feat / fix / docs / refactor / test / chore\\n\\n## 分支策略\\n\\n- main：稳定分支，只接受合并\\n- develop：集成分支\\n- feature/*：功能分支\\n\\n## 评审要求\\n\\n1. 单次提交不超过 400 行\\n2. 必须通过 CI\\n3. 至少一人 approve',
    '约定团队的提交信息格式、分支策略与代码评审要求。', '已发布', 152).lastInsertRowid;
  const d3 = insDoc.run(adminId, sp2, 'API 设计约定',
    '# API 设计约定\\n\\n## 响应结构\\n\\n统一使用 {code, data, message}：\\n\\n- 成功：code = 0\\n- 失败：code = HTTP 状态码\\n\\n## 命名\\n\\n- 路径用小写复数：/api/entities/docs\\n- 查询参数用驼峰：pageSize\\n\\n## 分页\\n\\n列表接口统一返回 {list, total, page, pageSize, pages}。',
    '统一后端接口的响应结构、命名规范与分页约定。', '草稿', 98).lastInsertRowid;
  insDoc.run(adminId, sp3, '双十一活动文案', '# 双十一活动文案\\n\\n## 主标题\\n\\n限时狂欢，全场低至 5 折\\n\\n## 副标题\\n\\n错过再等一年，好物不等人\\n\\n## 行动号召\\n\\n立即抢购 →', '双十一大促的主视觉文案与行动号召。', '草稿', 42);

  // 版本记录
  const insRev = db.prepare('INSERT INTO revisions (user_id,doc_id,content,note) VALUES (?,?,?,?)');
  insRev.run(adminId, d1, '初稿：搭建基本结构', '创建文档');
  insRev.run(adminId, d1, '补充核心概念章节', '完善内容');
  insRev.run(adminId, d2, '初稿', '创建文档');
  insRev.run(adminId, d2, '补充评审要求', '根据团队反馈补充');`,
};
