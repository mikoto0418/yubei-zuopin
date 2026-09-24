// 故障诊断闭环：AI 结果写入 faults.diagnosis，并自动创建 work_order（status=created）。
// 这是本系统「AI 回写业务 → 驱动后续流程」的核心：诊断不是一次性文本，而是工单的来源。
'use strict';
const { ok, fail, toNumber } = require('../src/http');
const ai = require('../src/ai');
const { STATUS_LABEL } = require('../src/workflow');

// 本地降级规则：无 LLM_API_KEY 时也能给出可用的诊断与优先级判断。
function localDiagnosis({ title, description, severity, category }) {
  const text = [title, description].join(' ');
  const rules = [
    { k: /灯|闪烁|不亮|照明/, cause: '灯具光源老化 / 镇流器或驱动电源故障 / 接线端子松动', tools: '万用表、绝缘胶带、备用 LED 灯头、升降梯', hours: 1.5, level: '中' },
    { k: /监控|摄像头|离线|无信号/, cause: '网络链路中断 / 摄像机电源适配器损坏 / 光模块故障', tools: '网线测试仪、PoE 供电模块、笔记本、内六角扳手', hours: 2, level: '高' },
    { k: /井盖|沉降|破损|异响/, cause: '井盖座圈沉降 / 井盖疲劳开裂 / 周边路面空洞', tools: '撬棍、警示围栏、C30 速干混凝土、测平尺', hours: 3, level: '高' },
    { k: /垃圾|箱体|开裂|满溢/, cause: '箱体腐蚀或外力碰撞 / 铰链脱落 / 清运频次不足', tools: '扳手套装、替换箱体、清洁用具', hours: 1, level: '低' },
    { k: /消防栓|渗漏|漏水|压力/, cause: '密封圈老化 / 阀杆填料失效 / 管网压力波动', tools: '专用消防扳手、生料带、压力表、密封圈', hours: 2, level: '高' },
    { k: /站牌|灯箱|线路/, cause: '灯箱内部线路短路 / 电源适配器故障 / 面板进水', tools: '绝缘工具、备用适配器、密封胶、万用表', hours: 1.5, level: '中' },
    { k: /排水|积水|堵塞/, cause: '雨水篦子堵塞 / 管道淤积 / 井体结构破损', tools: '高压疏通机、抓斗、警示标志', hours: 3, level: '中' },
  ];
  const hit = rules.find((r) => r.k.test(text)) || {
    cause: '现场情况需进一步确认（设备老化 / 外部损伤 / 安装缺陷）',
    tools: '常规工具箱、万用表、安全防护装备',
    hours: 2,
    level: '中',
  };
  const sevBoost = severity === '严重' ? '高' : severity === '轻微' ? '低' : hit.level;
  return [
    '【诊断结论】' + (category || '市政设施') + '类故障，初步判定为：' + hit.cause,
    '【风险等级】' + sevBoost,
    '【所需工具】' + hit.tools,
    '【预计工时】' + hit.hours + ' 小时（含往返）',
    '【临时处置】' + (sevBoost === '高' ? '立即设置安全围挡并安排 2 人小组当日处置' : '设置警示标识，纳入 48 小时内计划处理'),
    '【建议派工】' + (sevBoost === '高' ? '优先派单，需 2 人以上' : '常规派单，1-2 人'),
  ].join('\n');
}

// 由严重程度映射工单优先级，供派单排序使用。
function priorityOf(severity) {
  if (severity === '严重') return 'high';
  if (severity === '轻微') return 'low';
  return 'normal';
}

module.exports = (db) => async (req, res) => {
  try {
    const id = toNumber(req.params.id);
    const fault = db.prepare('SELECT * FROM faults WHERE id = ?').get(id);
    if (!fault) return fail(res, 404, '故障记录不存在');

    const facility = db.prepare(
      'SELECT f.*, t.name AS type_name, d.name AS district_name FROM facilities f ' +
      'LEFT JOIN facility_types t ON t.id = f.type_id ' +
      'LEFT JOIN districts d ON d.id = f.district_id WHERE f.id = ?'
    ).get(fault.facility_id);

    const payload = {
      title: fault.title,
      description: fault.description || '',
      severity: fault.severity || '一般',
      category: facility ? (facility.category || facility.type_name || '') : '',
      address: facility ? facility.address || '' : '',
      district: facility ? facility.district_name || '' : '',
    };

    const result = await ai.generate(
      [
        { role: 'system', content: '你是市政设施运维专家。根据故障信息输出诊断结论、风险等级、所需工具、预计工时、临时处置、建议派工。中文，分点，简洁实用。' },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      () => localDiagnosis(payload),
      { temperature: 0.6 }
    );

    // 诊断结果落库 + 自动建单，两者同一事务，避免只写一半。
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const priority = priorityOf(fault.severity);
    let orderId;
    const tx = db.transaction(() => {
      db.prepare('UPDATE faults SET diagnosis = ?, diagnosed_at = ?, status = ? WHERE id = ?')
        .run(result.text, now, '处理中', id);
      const code = 'WO' + String(id).padStart(4, '0') + Date.now().toString().slice(-4);
      const info = db.prepare(
        'INSERT INTO work_orders (code, fault_id, facility_id, team_id, status, priority, created_by, description) VALUES (?,?,?,?,?,?,?,?)'
      ).run(code, id, fault.facility_id, null, 'created', priority, req.user.id, '由 AI 诊断自动建单：' + fault.title);
      orderId = info.lastInsertRowid;
      db.prepare('INSERT INTO work_order_logs (order_id, from_status, to_status, operator_id, remark) VALUES (?,?,?,?,?)')
        .run(orderId, null, 'created', req.user.id, 'AI 诊断（来源 ' + result.source + '）后自动创建工单');
    });
    tx();

    const order = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(orderId);
    return ok(res, {
      diagnosis: result.text,
      source: result.source,
      fault: db.prepare('SELECT * FROM faults WHERE id = ?').get(id),
      work_order: { ...order, status_label: STATUS_LABEL[order.status] },
      auto_created: true,
    }, '诊断完成并已自动创建工单');
  } catch (e) {
    return fail(res, 500, 'AI 服务异常：' + e.message);
  }
};
