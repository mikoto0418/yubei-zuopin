const express = require('express');
const { db, dayOffset } = require('../db');
const { auth } = require('../middleware/auth');
const { fail } = require('./util');

const router = express.Router();
router.use(auth);

const today = () => dayOffset(0);
const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || '');
function toMin(t) { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; }
function fromMin(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }

// 兼容 OpenAI 的 chat completions 调用；仅在配置了 LLM_API_KEY 时启用
async function callLLM(messages) {
  const key = process.env.LLM_API_KEY;
  if (!key) return null;
  const base = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, temperature: 0.7 }),
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// 规则引擎：根据目标考试/剩余天数生成备考计划条目（本地回退）
function generateRulePlan(user, goals, daysLeft) {
  const exam = user.target_exam;
  const planItems = [];
  const baseHours = daysLeft === null ? 3 : (daysLeft > 180 ? 6 : daysLeft > 90 ? 8 : daysLeft > 45 ? 9 : 10);

  if (exam === '考研') {
    planItems.push({ subject: '数学', content: '基础——高等数学核心概念与公式梳理，专项练习 20 题', exam_hours: 2 });
    planItems.push({ subject: '英语', content: '考研词汇 60 个 + 真题阅读 2 篇并精翻', exam_hours: 1.5 });
    planItems.push({ subject: '政治', content: '马原/毛概章节复习 + 真题选择题 20 题', exam_hours: 1 });
  } else if (exam === '四六级') {
    planItems.push({ subject: '英语', content: '四六级高频词汇 50 个 + 听力真题精听 1 套', exam_hours: 1.5 });
    planItems.push({ subject: '英语', content: '阅读理解 3 篇 + 写作/翻译模板积累', exam_hours: 1.5 });
  } else {
    planItems.push({ subject: '行测', content: '言语理解与判断推理专项 30 题', exam_hours: 1.5 });
    planItems.push({ subject: '申论', content: '材料阅读 + 归纳概括大题 1 道', exam_hours: 1.5 });
  }
  const weakest = [...goals].sort((a, b) => (a.progress / a.target) - (b.progress / b.target))[0];
  if (weakest) {
    planItems.push({
      subject: weakest.subject,
      content: `短板补强：针对「${weakest.subject}」查漏补缺，重做错题并整理错题本`,
      exam_hours: Math.round(baseHours / 3 * 10) / 10,
    });
  }
  planItems.push({ subject: '全科', content: `当日学习总时长目标 ${baseHours} 小时，晚间复盘（番茄钟 + 错题回顾）`, exam_hours: 1 });

  return {
    source: '内置规则引擎',
    days_left: daysLeft,
    daily_hours: baseHours,
    items: planItems,
    summary: `距${exam}考试${daysLeft === null ? '未设置日期' : '还有 ' + daysLeft + ' 天'}，建议保持每日 ${baseHours} 小时高效备考。`,
  };
}

// 把计划条目铺到日历：30 分钟粒度，从 08:00 起顺排，避开已有时间块
function layoutToBlocks(items, date, uid, existing) {
  const occupied = existing.map((b) => ({ s: toMin(b.start_time), e: toMin(b.end_time) }));
  let cursor = 8 * 60; // 08:00 起排
  const out = [];
  for (const it of items) {
    const totalMin = Math.max(30, Math.round((Number(it.exam_hours) || 1) * 60 / 30) * 30);
    // 段落切成不超过 90 分钟的块
    let remain = totalMin;
    while (remain > 0) {
      const chunk = Math.min(90, remain);
      // 找一个不冲突的空档
      let guard = 0;
      while (guard++ < 96) {
        const s = cursor, e = cursor + chunk;
        if (e > 23 * 60) { cursor = 8 * 60; continue; }
        const clash = occupied.some((o) => o.s < e && o.e > s);
        if (!clash) break;
        cursor += 30;
      }
      const s = cursor, e = cursor + chunk;
      if (e > 23 * 60) break;
      out.push({
        user_id: uid,
        subject: it.subject,
        title: String(it.content || '').slice(0, 120),
        block_date: date,
        start_time: fromMin(s),
        end_time: fromMin(e),
        status: 'planned',
        source: 'ai',
      });
      occupied.push({ s, e });
      cursor = e;
      remain -= chunk;
    }
  }
  return out;
}

// ---------- 生成个性化备考计划 → 拆解为 plan_blocks 写入日历 ----------
router.post('/plan', async (req, res) => {
  const uid = req.user.uid;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
  const goals = db.prepare('SELECT * FROM goals WHERE user_id = ?').all(uid);
  const date = /^\d{4}-\d{2}-\d{2}$/.test((req.body || {}).date || '') ? req.body.date : today();
  let daysLeft = null;
  if (user.exam_date) daysLeft = Math.max(0, Math.ceil((new Date(user.exam_date).getTime() - Date.now()) / 86400000));

  const weakKps = db.prepare(
    'SELECT name, mastery FROM knowledge_points WHERE user_id=? ORDER BY mastery ASC LIMIT 5'
  ).all(uid);
  const wrongs = db.prepare(
    "SELECT subject, knowledge_point FROM wrong_questions WHERE user_id=? AND status != 'mastered' LIMIT 8"
  ).all(uid);

  const prompt = `你是一名备考规划助手。用户目标考试：${user.target_exam}，距离考试${daysLeft ?? '未设置'}天。` +
    (goals.length ? '各科目目标：' + goals.map((g) => `${g.subject}(目标${g.target}分,当前${g.progress}分)`).join('、') + '。' : '') +
    (weakKps.length ? '薄弱知识点：' + weakKps.map((k) => `${k.name}(掌握度${k.mastery})`).join('、') + '。' : '') +
    (wrongs.length ? '待攻克错题涉及：' + wrongs.map((w) => `${w.subject}/${w.knowledge_point}`).join('、') + '。' : '') +
    '请为这一天生成一份可执行的备考计划（含科目、具体内容、预计时长小时）。' +
    '仅返回 JSON 数组，格式：[{"subject":"科目","content":"具体任务","exam_hours":2}]，用中文。不要返回其他文字。';

  let items;
  let source = '内置规则引擎';
  const llmText = await callLLM([
    { role: 'system', content: '你是中文备考规划专家，输出严格 JSON。' },
    { role: 'user', content: prompt },
  ]);
  if (llmText) {
    try {
      const m = llmText.match(/\[[\s\S]*\]/);
      const arr = JSON.parse(m ? m[0] : llmText);
      if (Array.isArray(arr) && arr.length) {
        source = '大模型生成';
        items = arr.map((it) => ({
          subject: String(it.subject || '全科'),
          content: String(it.content || it.task || ''),
          exam_hours: Number(it.exam_hours) || 1,
        }));
      }
    } catch { /* 回退规则 */ }
  }
  if (!items) items = generateRulePlan(user, goals, daysLeft).items;

  // 落库：AI 结果拆解为时间块写入日历（同一天 AI 来源的块先清掉，避免堆积）
  const existing = db.prepare(
    "SELECT * FROM plan_blocks WHERE user_id=? AND block_date=? AND status='planned' AND source != 'ai'"
  ).all(uid, date);
  const blocks = layoutToBlocks(items, date, uid, existing);

  const tx = db.transaction(() => {
    // 先清理上一轮 AI 块及其提醒，避免遗留脏数据
    const olds = db.prepare(
      "SELECT id FROM plan_blocks WHERE user_id=? AND block_date=? AND source='ai' AND status='planned'"
    ).all(uid, date);
    const delRem = db.prepare("DELETE FROM reminders WHERE user_id=? AND related_type='plan_block' AND related_id=?");
    const delBlk = db.prepare('DELETE FROM plan_blocks WHERE id=?');
    for (const o of olds) { delRem.run(uid, o.id); delBlk.run(o.id); }

    const ins = db.prepare(`
      INSERT INTO plan_blocks (user_id,subject,title,block_date,start_time,end_time,status,source)
      VALUES (?,?,?,?,?,?,'planned','ai')
    `);
    const insRem = db.prepare(`
      INSERT INTO reminders (user_id,title,remind_at,related_type,related_id,status,channel)
      VALUES (?,?,?,'plan_block',?,'pending','app')
    `);
    for (const b of blocks) {
      const info = ins.run(b.user_id, b.subject, b.title, b.block_date, b.start_time, b.end_time);
      insRem.run(uid, `${b.subject}·${b.title} 即将开始`, `${b.block_date} ${b.start_time}`, info.lastInsertRowid);
    }
  });
  tx();

  res.json({
    ok: true,
    source,
    date,
    days_left: daysLeft,
    items: blocks.map((b) => ({ subject: b.subject, content: b.title, start_time: b.start_time, end_time: b.end_time })),
    blocks: db.prepare('SELECT * FROM plan_blocks WHERE user_id=? AND block_date=? ORDER BY start_time').all(uid, date),
  });
});

// ---------- 薄弱科目提升建议（落库到 reminders 作为待办）----------
router.post('/analysis', async (req, res) => {
  const uid = req.user.uid;
  const { subject, save } = req.body || {};
  const rows = db.prepare('SELECT subject, tags, total, correct FROM tasks WHERE user_id=?').all(uid);
  const want = subject && subject.trim();
  const agg = {};
  for (const r of rows) {
    if (want && r.subject !== want) continue;
    agg[r.subject] = agg[r.subject] || { total: 0, correct: 0 };
    agg[r.subject].total += r.total || 0;
    agg[r.subject].correct += r.correct || 0;
  }
  const data = Object.keys(agg)
    .map((s) => ({ subject: s, rate: agg[s].total ? Math.round(agg[s].correct / agg[s].total * 100) : 0 }))
    .sort((a, b) => a.rate - b.rate);

  const llmText = want ? await callLLM([
    { role: 'system', content: '你是备考提分教练。' },
    { role: 'user', content: `科目「${want}」正确率数据如下，给出 3 条具体可执行的提分建议（中文，分条）。` },
  ]) : null;

  const target = want || (data[0] && data[0].subject) || '目标科目';
  const advice = llmText ||
    `「${target}」当前整体正确率偏低，建议：1) 针对知识点标签里正确率最低的模块专项刷题并整理错题；2) 每 2 天做一次限时套卷模拟考试检验水平；3) 错题 3 天复做，降低遗忘曲线。`;

  // 落库：把建议转成一条今日待办提醒，形成「分析 → 落库 → 后续提醒」闭环
  let reminder = null;
  if (save) {
    const info = db.prepare(`
      INSERT INTO reminders (user_id,title,remind_at,related_type,status,channel)
      VALUES (?,?,?,'analysis','pending','app')
    `).run(uid, `AI 提分建议待执行：${target}`, `${today()} 20:00`);
    reminder = db.prepare('SELECT * FROM reminders WHERE id=?').get(info.lastInsertRowid);
  }

  res.json({
    ok: true,
    subject: want || null,
    data,
    advice,
    source: llmText ? '大模型生成' : '内置规则引擎',
    reminder,
  });
});

// 本地兜底：按科目给出一段真实感的中文解析
function localExplain(subject, question) {
  const s = String(subject || '').trim() || '该题';
  const q = String(question || '').trim().slice(0, 80);
  const hint = q ? `针对「${q}」` : '针对这类题型';
  const bank = {
    '数学': { idea: '先化简求解目标，把陌生问题拆成已知模型，再逐步计算验证。',
      mistake: '计算过程易抄错、代错公式；先审清变量定义与条件，再做带单位的回代验算。',
      tip: '同一类题连做 5 道，熟记通法后再练变式，速度与准确率才能同时上去。' },
    '英语': { idea: '先把握文意主旨，把关键词带回原文定位，再比对选项做排除。',
      mistake: '最容易凭印象选错、忽略转折与否定词；务必回到原文逐句核对。',
      tip: '把长难句圈出来逐层拆主干，词汇结合真题高频义记忆，效果更好。' },
    '政治': { idea: '先明确考点归属的概念体系，再用原理+材料+结论的框架组织答案。',
      mistake: '答非所问、罗列原理东拼西凑；应先看设问的词眼再决定主次。',
      tip: '知识点按「是什么—为什么—怎么办」框架记住，主观题分条作答更规范。' },
    '数据结构': { idea: '先画图理清结构关系，再套用对应算法的标准流程逐步推进。',
      mistake: '容易混淆栈与队列的适用场景；先判断是深度优先还是广度优先。',
      tip: '把常见算法的手写模板背熟，考场上直接套用再微调。' },
    '计算机网络': { idea: '先定位协议分层，再回忆该层的核心机制与字段含义。',
      mistake: '容易混淆相邻层的职责；先确认题目问的是哪一层。',
      tip: '用「分层 → 协议 → 机制」三段式记忆，答题时逐层展开。' },
    '专业课': { idea: '先明确考查的模型或定义，再按步骤推导并验证边界条件。',
      mistake: '容易漏掉前提条件；答题时先写出假设再展开。',
      tip: '把历年真题按题型归类，同一题型的解法固定下来。' },
    '行测': { idea: '先读设问再回题干定位，按题型套对应速算或排除技巧。',
      mistake: '时间分配失衡、在前几题耗时过多；先易后难，学会果断放弃偏难题。',
      tip: '每天限时刷一套并复盘耗时分布，把擅长的题型稳定在更高正确率。' },
    '申论': { idea: '先理清材料逻辑与关键词，再分类归纳要点、按题面要求组织答案。',
      mistake: '要点遗漏或照抄材料原文；应用自己的话凝练，注意条理与字数限制。',
      tip: '多积累规范表达与常用框架，答题时先列提纲再动笔。' },
  };
  const t = bank[s] || bank['数学'];
  return `${hint}，解题思路：${t.idea}易错点：${t.mistake}记忆与提升技巧：${t.tip}`;
}

// ---------- 单题 AI 讲解 ----------
router.post('/explain', async (req, res) => {
  const { subject, question } = req.body || {};
  const s = String(subject || '').trim();
  const q = String(question || '').trim();
  if (!q) return fail(res, '请描述一下题目内容再生成讲解');

  const prompt =
    `你是备考辅导老师。请针对下面的题目给出一段 150-200 字的中文解析，` +
    `必须包含三部分（用小标题分条）：【解题思路】分步讲清怎么入手和推进；【易错点】说明最容易出错的地方及如何避免；` +
    `【一句口诀/技巧】给一条便于记忆的口诀或应试小技巧。语言像老师上课一样通俗有条理，不要输出无关内容。\n` +
    `科目：${s || '综合'}\n题目：${q}`;

  const llmText = await callLLM([
    { role: 'system', content: '你是一名经验丰富、表达清晰的中文备考辅导老师。' },
    { role: 'user', content: prompt },
  ]);

  const source = llmText ? '大模型生成' : '内置讲解引擎';
  res.json({
    ok: true,
    subject: s || null,
    question: q,
    explanation: llmText || localExplain(s, q),
    source,
  });
});

module.exports = router;
void isTime;
