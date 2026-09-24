// CityLens · 城市设施巡检 —— 地图形态 + Element Plus
export default {
  key: 'citylens',
  name: 'CityLens',
  tagline: '城市公共设施巡检与故障上报',
  port: 4202,
  backend: 'node',
  frontend: 'vue',
  form: 'map',
  ui: 'element-plus',

  userColumns: [
    { name: 'district', type: "TEXT DEFAULT ''", demoAdmin: '市城管局' },
  ],

  entities: [
    {
      table: 'facilities',
      label: '设施',
      columns: [
        { name: 'user_id', type: 'INTEGER NOT NULL' },
        { name: 'name', type: 'TEXT NOT NULL' },
        { name: 'category', type: "TEXT DEFAULT '路灯'" },
        { name: 'address', type: "TEXT DEFAULT ''" },
        { name: 'lat', type: 'REAL DEFAULT 0' },
        { name: 'lng', type: 'REAL DEFAULT 0' },
        { name: 'status', type: "TEXT DEFAULT '正常'" },
        { name: 'installed_at', type: "TEXT DEFAULT ''" },
        { name: 'note', type: "TEXT DEFAULT ''" },
        { name: 'created_at', type: "TEXT DEFAULT (datetime('now','localtime'))" },
      ],
      required: ['name'],
      searchable: ['name', 'address', 'note'],
      filterable: ['category', 'status'],
    },
    {
      table: 'inspections',
      label: '巡检记录',
      columns: [
        { name: 'user_id', type: 'INTEGER NOT NULL' },
        { name: 'facility_id', type: 'INTEGER NOT NULL' },
        { name: 'result', type: "TEXT DEFAULT '正常'" },
        { name: 'inspector', type: "TEXT DEFAULT ''" },
        { name: 'note', type: "TEXT DEFAULT ''" },
        { name: 'inspected_at', type: "TEXT DEFAULT (datetime('now','localtime'))" },
      ],
      required: ['facility_id'],
      searchable: ['inspector', 'note'],
      filterable: ['facility_id', 'result'],
    },
    {
      table: 'faults',
      label: '故障上报',
      columns: [
        { name: 'user_id', type: 'INTEGER NOT NULL' },
        { name: 'facility_id', type: 'INTEGER NOT NULL' },
        { name: 'title', type: 'TEXT NOT NULL' },
        { name: 'description', type: "TEXT DEFAULT ''" },
        { name: 'severity', type: "TEXT DEFAULT '一般'" },
        { name: 'status', type: "TEXT DEFAULT '待处理'" },
        { name: 'reporter', type: "TEXT DEFAULT ''" },
        { name: 'created_at', type: "TEXT DEFAULT (datetime('now','localtime'))" },
      ],
      required: ['facility_id', 'title'],
      searchable: ['title', 'description'],
      filterable: ['status', 'severity', 'facility_id'],
    },
  ],

  indexes: [
    'idx_facilities_status ON facilities(status)',
    'idx_facilities_category ON facilities(category)',
    'idx_inspections_facility ON inspections(facility_id)',
    'idx_faults_facility ON faults(facility_id)',
    'idx_faults_status ON faults(status)',
  ],

  ai: {
    routes: [
      {
        path: 'diagnose',
        label: 'AI 故障诊断',
        system: '你是市政设施运维专家。根据故障描述判断可能原因、所需工具、预计工时和临时处置建议。中文，分点输出，简洁实用。',
        localBody: `    const desc = input.description || '';
    const sev = input.severity || '一般';
    const buildLocal = () => [
      '## 故障诊断建议',
      \`- 故障描述：\${desc || '（未填写）'}\`,
      \`- 严重程度：\${sev}\`,
      '- 可能原因：线路老化 / 接触不良 / 外部损伤（需现场确认）',
      '- 所需工具：万用表、绝缘胶带、备用灯头、梯子',
      '- 预计工时：1.5 小时（含往返）',
      '- 临时处置：设置警示标识，夜间加装临时照明',
      '- 建议派工：2 人小组，优先处理高severity工单',
    ].join('\\n');`,
      },
      {
        path: 'plan-route',
        label: 'AI 巡检路线规划',
        system: '你是巡检调度专家。根据待检设施清单规划最优巡检路线，考虑地理位置就近原则，输出顺序与预计耗时。中文。',
        localBody: `    const list = input.facilities || [];
    const buildLocal = () => {
      if (!list.length) return '当前无待巡检设施。';
      const lines = list.slice(0, 8).map((f, i) => \`\${i + 1}. \${f.name}（\${f.address || '地址未填'}）\`);
      return ['## 建议巡检路线', ...lines, '', \`共 \${list.length} 个点位，预计耗时 \${(list.length * 0.4).toFixed(1)} 小时（含路途）\`].join('\\n');
    };`,
      },
    ],
  },

  accounts: {
    demo: [
      { username: 'inspector1', password: 'inspector123', nickname: '王巡检' },
      { username: 'inspector2', password: 'inspector123', nickname: '李巡检' },
    ],
  },

  seedCode: `  // 设施（带真实经纬度，围绕济南市中心分布）
  const insF = db.prepare('INSERT INTO facilities (user_id,name,category,address,lat,lng,status,installed_at,note) VALUES (?,?,?,?,?,?,?,?,?)');
  const facilities = [
    ['经十路 001 号路灯', '路灯', '经十路与历山路交叉口东 50 米', 36.6512, 117.1201, '正常', '2023-04-12', 'LED 灯头，功率 120W'],
    ['经十路 002 号路灯', '路灯', '经十路与山师东路交叉口', 36.6520, 117.1235, '待检修', '2023-04-12', '近期闪烁，疑似接触不良'],
    ['泉城广场东侧垃圾桶', '垃圾箱', '泉城广场东入口', 36.6620, 117.0245, '正常', '2022-09-01', '双分类，容量 120L'],
    ['趵突泉公园监控杆', '监控', '趵突泉南门西侧', 36.6608, 117.0172, '故障', '2022-11-20', '摄像头无信号，已报修'],
    ['大明湖路消防栓', '消防栓', '大明湖路 18 号门前', 36.6712, 117.0298, '正常', '2021-06-15', '去年年检合格'],
    ['解放路公交站牌', '站牌', '解放路与历山路交口西', 36.6598, 117.0456, '待检修', '2023-01-08', '站牌灯箱不亮'],
    ['舜耕路井盖 07', '井盖', '舜耕路与会展路交口', 36.6421, 117.0398, '正常', '2020-03-22', '重型铸铁，无异响'],
    ['文化西路排水口', '排水', '文化西路 32 号对面', 36.6567, 117.0334, '正常', '2021-08-10', '汛期前已清淤'],
    ['千佛山路照明杆', '路灯', '千佛山路中段', 36.6389, 117.0412, '正常', '2023-07-01', '太阳能+市电双路'],
    ['英雄山路垃圾箱', '垃圾箱', '英雄山路 105 号旁', 36.6312, 117.0223, '待检修', '2022-05-18', '箱体破损，需更换'],
  ];
  const fids = facilities.map((f) => insF.run(adminId, ...f).lastInsertRowid);

  // 巡检记录
  const insI = db.prepare('INSERT INTO inspections (user_id,facility_id,result,inspector,note,inspected_at) VALUES (?,?,?,?,?,?)');
  insI.run(adminId, fids[0], '正常', '王巡检', '灯头亮度正常，灯杆无倾斜', '2026-09-18 09:20:00');
  insI.run(adminId, fids[1], '异常', '王巡检', '发现灯头闪烁，标记待检修', '2026-09-18 09:35:00');
  insI.run(adminId, fids[2], '正常', '李巡检', '箱体完好，分类标识清晰', '2026-09-19 10:10:00');
  insI.run(adminId, fids[3], '异常', '李巡检', '监控无信号，已上报故障工单', '2026-09-19 10:40:00');
  insI.run(adminId, fids[4], '正常', '王巡检', '消防栓压力正常，无渗漏', '2026-09-20 14:00:00');
  insI.run(adminId, fids[5], '异常', '李巡检', '站牌灯箱不亮，需电工处理', '2026-09-20 15:20:00');

  // 故障上报
  const insFa = db.prepare('INSERT INTO faults (user_id,facility_id,title,description,severity,status,reporter) VALUES (?,?,?,?,?,?,?)');
  insFa.run(adminId, fids[3], '监控摄像头无信号', '趵突泉南门西侧监控杆摄像头离线超过 24 小时，后台无画面', '严重', '处理中', '李巡检');
  insFa.run(adminId, fids[1], '路灯灯头闪烁', '经十路 002 号路灯夜间持续闪烁，影响照明', '一般', '待处理', '王巡检');
  insFa.run(adminId, fids[5], '公交站牌灯箱不亮', '解放路公交站牌灯箱不亮，夜间乘客看不清线路', '一般', '待处理', '李巡检');
  insFa.run(adminId, fids[9], '垃圾箱箱体破损', '英雄山路垃圾箱侧面开裂，存在划伤风险', '轻微', '已解决', '王巡检');`,
};
