// AI 润色能力：若配置了 LLM_API_KEY 则调用兼容 OpenAI 的 /chat/completions，
// 否则返回本地 mock 模板润色结果。真实接口与 mock 都返回统一结构 { polished }。

function mockPolish(text) {
  const t = (text || '').trim();
  if (!t) return '（空内容，无需润色）';

  // 简单本地润色：规整标点、拆分长句为短句、补充连接词等模板化处理
  let result = t
    .replace(/[，。；：][，。；：]+/g, (m) => m[0]) // 合并重复标点
    .replace(/\s+/g, ' ');

  const sentences = result
    .split(/(?<=[。！？；])/)
    .map((s) => s.trim())
    .filter(Boolean);

  const improved = sentences.map((s, i) => {
    if (i > 0) s = '整体而言，' + s.charAt(0).toLowerCase() + s.slice(1);
    return s;
  });

  return improved.join('') || result;
}

/*
 * polish(text) -> Promise<{ polished: string }>
 * 若配置了 key 走真实 LLM，否则走 mock。
 */
async function polish(text) {
  const key = process.env.LLM_API_KEY;
  if (!key) {
    return { polished: mockPolish(text), source: 'local' };
  }

  const baseURL = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';

  try {
    const resp = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              '你是一个中文润色助手。请将用户给出的笔记或简历文本润色，使表达更通顺、专业、简洁，保持原有信息不变，仅输出润色后的文本。',
          },
          { role: 'user', content: text },
        ],
      }),
    });

    if (!resp.ok) {
      // LLM 失败时优雅降级到本地，保证接口永远可用
      return { polished: mockPolish(text), source: 'local', downgrade: true };
    }
    const data = await resp.json();
    const polished = data?.choices?.[0]?.message?.content?.trim();
    return { polished: polished || mockPolish(text), source: 'llm' };
  } catch {
    return { polished: mockPolish(text), source: 'local', downgrade: true };
  }
}

// 通用 LLM chat：兼容 OpenAI 的 /chat/completions，失败抛异常（由调用方决定兜底）
function chat(messages, { temperature = 0.7, maxTokens = 700 } = {}) {
  const key = process.env.LLM_API_KEY;
  const baseURL = (process.env.LLM_BASE_URL || 'https://apihub.agnes-ai.com/v1').replace(/\/$/, '');
  const model = process.env.LLM_MODEL || 'agnes-2.5-flash';
  return fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
  }).then(async (resp) => {
    if (!resp.ok) throw new Error('LLM HTTP ' + resp.status);
    const d = await resp.json();
    return (d?.choices?.[0]?.message?.content || '').trim();
  });
}

// 本地兜底周报：基于任务/笔记统计生成自然、有细节的中文周报
function mockWeeklyReport({ focus = '', tasks = [], notes = [] } = {}) {
  const done = tasks.filter((t) => t.done).length;
  const total = tasks.length;
  const undone = tasks.filter((t) => !t.done);
  const highUndone = undone.filter((t) => t.priority === 'high');
  const topics = notes
    .map((n) => String(n.title || '').replace(/[:：].*$/, '').trim())
    .filter(Boolean).slice(0, 3).join('、');
  const f = String(focus || '').trim();

  const rate = total ? Math.round((done / total) * 100) : 0;
  const parts = [];
  parts.push(
    `本周共记录 ${total} 项学习任务，已完成 ${done} 项（${rate}%）` +
      (topics ? `，涉及的笔记主题包括${topics}` : '') +
      `，整体节奏${total && rate >= 60 ? '保持得不错' : rate > 0 ? '尚在逐步推进' : '需要尽快起步'}。`
  );
  if (highUndone.length) {
    parts.push(
      `当前还有 ${highUndone.length} 项高优先级任务尚未收尾` +
        (highUndone[0] ? `，其中「${highUndone[0].title}」建议优先集中处理` : '') +
        '。'
    );
  } else if (undone.length) {
    parts.push(`还有 ${undone.length} 项任务未完成，多为轻量收尾，可纳入下周计划。`);
  }
  if (f) {
    parts.push(`围绕「${f}」，建议下周把复盘与实际练习结合，先啃下最难的 1-2 个知识点，再做配套题目巩固。`);
  } else {
    parts.push('下周建议优先处理高优先级任务，再留出固定时间回顾错题与笔记，把学到的内容真正内化。');
  }
  return parts.join('') || '本周记录较少，建议从今天起给学习列一张清晰的任务清单，并定期复盘。';
}

/*
 * generateWeeklyReport({ focus, tasks, notes }) -> Promise<{ report, source, downgrade? }>
 * 配置了 LLM_API_KEY 先走云端大模型，云端失败或无 key 时用本地兜底，保证接口永远可用。
 */
async function generateWeeklyReport({ focus = '', tasks = [], notes = [] } = {}) {
  const key = process.env.LLM_API_KEY;
  if (key) {
    try {
      const taskLines =
        tasks.map((t) => `[${t.done ? '已完成' : '未完成'}][${t.priority || ''}]${t.title}${t.project ? `（${t.project}）` : ''}`).join('\n') ||
        '（无任务记录）';
      const noteLines = notes.map((n) => n.title || '').join('、') || '（无笔记）';
      const focusText = String(focus || '').trim() || '整体学习情况';
      const prompt = [
        '请根据以下数据生成一篇约 150 字的《本周学习报告》，使用简体中文。',
        '结构要求：先写 1-2 句学习亮点（结合具体任务/笔记），再写 1-2 句现存问题，最后给出 1-2 条下周建议。',
        `关注焦点：${focusText}`,
        `本周任务：\n${taskLines}`,
        `本周笔记主题：${noteLines}`,
      ].join('\n');
      const out = await chat(
        [
          { role: 'system', content: '你是一名温和、真诚的中国学生学习规划老师，能用具体细节说话，不空喊口号，不编造数据。' },
          { role: 'user', content: prompt },
        ],
        { temperature: 0.7, maxTokens: 600 }
      );
      if (out && out.trim()) return { report: out.trim(), source: 'llm' };
      throw new Error('LLM 返回为空');
    } catch (e) {
      console.warn('[ai] 云端周报失败，回退本地兜底：' + e.message);
    }
  }
  return { report: mockWeeklyReport({ focus, tasks, notes }), source: 'local', downgrade: !!key };
}

// 本地兜底：把一段经历描述拆成 2-4 条量化亮点
function mockHighlights(exp = {}) {
  const desc = String(exp.description || exp.desc || '').trim();
  if (!desc) return [];
  const parts = desc
    .split(/[。；;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  return parts.map((s) => {
    let t = s.replace(/^[，,、\s]+/, '');
    if (!/[。！？]$/.test(t)) t += '。';
    return t;
  });
}

/*
 * polishResume({ target_job, skills, experiences })
 *  -> Promise<{ polished, highlights: {index, points[]}[], source }>
 * 有 LLM 时让模型同时输出润色正文与结构化亮点；失败或无 key 时本地兜底。
 */
async function polishResume({ target_job = '', skills = [], experiences = [] } = {}) {
  const expLines = experiences
    .map((e, i) => {
      const period = [e.start_date || e.year || '', e.end_date || ''].filter(Boolean).join('–');
      return `${i + 1}. ${e.org || ''} | ${e.role || ''} | ${period} | ${e.description || e.desc || ''}`;
    })
    .join('\n');

  const localResult = () => {
    const lines = [];
    if (target_job) lines.push(`求职意向：${target_job}`);
    if (skills.length) lines.push(`核心技能：${skills.join('、')}`);
    if (experiences.length) {
      lines.push('实习与项目经历：');
      experiences.forEach((e) => {
        const period = [e.start_date || e.year || '', e.end_date || ''].filter(Boolean).join('–');
        const head = [e.org, e.role, period].filter(Boolean).join(' · ');
        lines.push(`· ${head}`);
        const pts = mockHighlights(e);
        (pts.length ? pts : ['（待补充具体成果）']).forEach((p) => lines.push(`  - ${p}`));
      });
    }
    return {
      polished: lines.join('\n'),
      highlights: experiences.map((e, index) => ({ index, points: mockHighlights(e) })),
      source: 'local',
    };
  };

  const key = process.env.LLM_API_KEY;
  if (!key) return localResult();

  try {
    const prompt = [
      '请润色下面这份中文简历的原始素材，输出两部分，用一行 "---HIGHLIGHTS---" 分隔。',
      '第一部分：通顺、专业、简洁的简历正文（纯文本，可用 · 和 - 做层级，不要 Markdown 标题）。',
      '第二部分：JSON 数组，每项形如 {"index": 0, "points": ["量化亮点1", "量化亮点2"]}，index 对应经历序号（从 0 开始），每条亮点一句话、尽量含具体动作与结果。',
      `岗位意向：${target_job || '（未填写）'}`,
      `技能：${skills.join('、') || '（未填写）'}`,
      `经历：\n${expLines || '（无）'}`,
    ].join('\n');

    const out = await chat(
      [
        { role: 'system', content: '你是一名中文简历顾问，只做润色与结构化，不编造用户未提供的经历、公司或数据。' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.5, maxTokens: 1200 }
    );

    if (!out || !out.trim()) throw new Error('LLM 返回为空');
    const [polishedPart, highlightPart] = out.split('---HIGHLIGHTS---');
    let highlights = [];
    if (highlightPart) {
      try {
        const parsed = JSON.parse(highlightPart.trim().replace(/^```(json)?|```$/g, '').trim());
        if (Array.isArray(parsed)) {
          highlights = parsed
            .filter((h) => h && Number.isInteger(h.index))
            .map((h) => ({ index: h.index, points: Array.isArray(h.points) ? h.points.map(String) : [] }));
        }
      } catch { /* 亮点解析失败时退回本地规则 */ }
    }
    if (!highlights.length) {
      highlights = experiences.map((e, index) => ({ index, points: mockHighlights(e) }));
    }
    return {
      polished: (polishedPart || out).trim(),
      highlights,
      source: 'llm',
    };
  } catch (e) {
    console.warn('[ai] 简历润色失败，回退本地兜底：' + e.message);
    return { ...localResult(), downgrade: true };
  }
}

module.exports = { polish, mockPolish, generateWeeklyReport, mockWeeklyReport, polishResume, mockHighlights };