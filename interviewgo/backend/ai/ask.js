// AI 出题与追问：优先从题库按岗位抽题，配置了 LLM_API_KEY 时走大模型，否则本地规则降级。
'use strict';
const { ok, fail, toNumber } = require('../src/http');
const ai = require('../src/ai');

const FALLBACK_BANK = {
  前端工程师: ['请解释浏览器的事件循环机制，宏任务与微任务的区别是什么？', 'React 的 useEffect 依赖数组为空、不写、写具体值，三种情况分别意味着什么？', '如何优化一个首屏加载 3 秒的页面？请给出具体手段和预期收益。'],
  后端工程师: ['数据库索引为什么能加速查询？什么情况下索引会失效？', '如何设计一个高并发场景下的秒杀系统？', 'Redis 缓存穿透、击穿、雪崩分别是什么，如何应对？'],
  产品经理: ['你如何判断一个需求该不该做？优先级框架是什么？', '举例说明你如何用数据驱动一次产品迭代。', '如何设计一个新用户引导流程？关键指标是什么？'],
  数据分析师: ['如何判断一次 A/B 测试的结果是否显著？', '用户流失分析你会从哪些维度切入？', 'SQL 中 window function 的典型使用场景有哪些？'],
};

/** 从题库按岗位抽取题目（内置优先），无题时回落内置话术 */
function pickFromBank(db, { positionId, role, round }) {
  let rows = [];
  if (positionId) {
    rows = db.prepare('SELECT id, content, key_points FROM question_bank WHERE position_id = ? ORDER BY id ASC').all(positionId);
  }
  if (!rows.length) {
    rows = db.prepare('SELECT id, content, key_points FROM question_bank WHERE position_id IN (SELECT id FROM job_positions WHERE name = ?) ORDER BY id ASC').all(role);
  }
  return rows;
}

module.exports = (db) => async (req, res) => {
  try {
    const input = req.body || {};
    const role = input.role || '前端工程师';
    const level = input.level || '初级';
    const round = Number(input.round) || 1;
    const positionId = input.position_id ? toNumber(input.position_id) : null;

    const rows = pickFromBank(db, { positionId, role, round });
    const fallback = FALLBACK_BANK[role] || FALLBACK_BANK['前端工程师'];

    const buildLocal = () => {
      if (rows.length) return rows[(round - 1) % rows.length].content;
      return fallback[(round - 1) % fallback.length];
    };

    const picked = rows.length ? rows[(round - 1) % rows.length] : null;
    const result = await ai.generate(
      [
        { role: 'system', content: '你是一位资深技术面试官。根据候选人的目标岗位、级别和上一轮回答，提出下一个面试问题。一次只问一个问题，简洁专业。若上一轮回答有可追问点，优先深挖。' },
        { role: 'user', content: JSON.stringify({ ...input, bank_question: picked ? picked.content : null }) },
      ],
      buildLocal,
      { temperature: 0.7 },
    );

    return ok(res, {
      text: result.text,
      source: result.source,
      question_id: picked ? picked.id : null,
      key_points: picked ? JSON.parse(picked.key_points || '[]') : [],
    });
  } catch (e) {
    return fail(res, 500, 'AI 服务异常：' + e.message);
  }
};
