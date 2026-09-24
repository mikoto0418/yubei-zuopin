// AI 智能派单：按故障类型匹配班组专长 + 当前负载，给出推荐班组与理由。
// 只推荐不落库（派单动作由工单状态流转 assigned 完成），保持「AI 建议 → 人工确认」的边界。
'use strict';
const { ok, fail, toNumber } = require('../src/http');
const ai = require('../src/ai');

// 故障关键词 → 班组专长标签，用于本地匹配打分。
const SPECIALTY_HINTS = [
  { k: /灯|照明|不亮|闪烁/, tags: ['照明', '电气'] },
  { k: /监控|摄像头|信号|网络/, tags: ['弱电', '监控'] },
  { k: /井盖|路面|沉降|破损/, tags: ['市政', '道路'] },
  { k: /排水|积水|管道|堵塞/, tags: ['排水', '市政'] },
  { k: /消防栓|渗漏|漏水/, tags: ['给水', '管道'] },
  { k: /垃圾|箱体|清运/, tags: ['环卫'] },
  { k: /站牌|公交|灯箱/, tags: ['电气', '市政'] },
];

function tagsFor(text) {
  const hit = SPECIALTY_HINTS.find((r) => r.k.test(text));
  return hit ? hit.tags : ['市政'];
}

// 专长匹配度 0.65 + 空余产能 0.35。专长比空闲更重要，满载班组被显著降权。
function localDispatch({ teams, text }) {
  const need = tagsFor(text);
  const scored = teams.map((t) => {
    const own = String(t.specialties || '').split(/[,，、\s]+/).filter(Boolean);
    const match = own.filter((s) => need.some((n) => s.includes(n) || n.includes(s))).length;
    const load = t.capacity ? Math.min(1, (t.active_jobs || 0) / t.capacity) : 1;
    const score = match * 0.65 + (1 - load) * 0.35;
    return { team: t, match, load, score };
  }).sort((a, b) => b.score - a.score);
  return { need, scored };
}

module.exports = (db) => async (req, res) => {
  try {
    const b = req.body || {};
    const faultId = b.fault_id ? toNumber(b.fault_id) : null;
    let text = String(b.text || b.description || '');

    if (faultId) {
      const fault = db.prepare('SELECT * FROM faults WHERE id = ?').get(faultId);
      if (!fault) return fail(res, 404, '故障记录不存在');
      const facility = db.prepare('SELECT * FROM facilities WHERE id = ?').get(fault.facility_id);
      text = [fault.title, fault.description, fault.diagnosis, facility && facility.category].filter(Boolean).join(' ');
    }
    if (!text) return fail(res, 400, '请提供 fault_id 或 text 以便匹配班组');

    const teams = db.prepare('SELECT * FROM maintenance_teams WHERE active = 1 ORDER BY id ASC').all();
    if (!teams.length) return fail(res, 400, '暂无可用班组，请先在班组管理中维护');

    const { need, scored } = localDispatch({ teams, text });
    const best = scored[0];

    const buildLocal = () => [
      '【推荐班组】' + best.team.name + '（班组长：' + (best.team.leader || '未填写') + '）',
      '【匹配专长】需求标签：' + need.join('、') + '；班组专长：' + (best.team.specialties || '未标注'),
      '【负载情况】当前 ' + (best.team.active_jobs || 0) + '/' + (best.team.capacity || 0) + '，负载率 ' + (best.load * 100).toFixed(0) + '%',
      '【决策理由】专长匹配度最高（命中 ' + best.match + ' 项），且剩余产能充足，可在承诺时限内响应。',
      '【备选方案】' + (scored.slice(1, 3).map((s) => s.team.name + '（负载 ' + (s.load * 100).toFixed(0) + '%）').join('；') || '无'),
    ].join('\n');

    const result = await ai.generate(
      [
        { role: 'system', content: '你是市政运维调度专家。根据故障信息与候选班组列表，推荐最合适的维修班组并说明理由。中文，分点，简洁。' },
        { role: 'user', content: JSON.stringify({ fault: text, teams }) },
      ],
      buildLocal,
      { temperature: 0.5 }
    );

    return ok(res, {
      recommended_team_id: best.team.id,
      recommended_team: best.team,
      need_tags: need,
      candidates: scored.map((s) => ({
        team_id: s.team.id,
        name: s.team.name,
        match: s.match,
        load: Number(s.load.toFixed(2)),
        active_jobs: s.team.active_jobs,
        capacity: s.team.capacity,
        score: Number(s.score.toFixed(3)),
      })),
      reason: result.text,
      source: result.source,
    }, '派单建议已生成');
  } catch (e) {
    return fail(res, 500, 'AI 服务异常：' + e.message);
  }
};
