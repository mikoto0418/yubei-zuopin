const db = require('../db');

// ---------- 配置 ----------
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_BASE_URL = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

//
// 1) AI 生成商品描述
//    配置了 LLM 环境变量 -> 调用兼容 OpenAI 接口；否则 -> 本地模板 Mock
//
async function aiGenerate({ title, category, keywords, condition, price }) {
  const kw = (keywords || []).filter(Boolean).slice(0, 5);
  const kwText = kw.length ? `关键词：${kw.join('、')}` : '';

  if (LLM_API_KEY) {
    const prompt = [
      `你是一位校园二手交易平台的金牌文案。为下面这件商品写一段吸引人的中文商品描述，150 字以内，语气真诚、突出卖点和性价比，可用少量 emoji，结尾加一句友好提醒。`,
      `标题：${title}`,
      `分类：${category || '未填写'}`,
      `成色：${condition || '未填写'}`,
      price ? `价格：${price} 元` : `价格：面议/未填写`,
      kwText,
      `不要编造与给定信息冲突的内容。直接输出描述正文，不要加标题。`,
    ].join('\n');

    const resp = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM_API_KEY}` },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
      }),
    });
    if (!resp.ok) throw new Error(`LLM 接口返回 ${resp.status}`);
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (text) return { description: text, source: 'llm' };
    throw new Error('LLM 未返回有效内容');
  }

  // 本地模板 Mock（未配置 LLM 时降级）
  const templates = [
    `郑重出手【${title}】！${category ? `属于「${category}」好物，` : ''}${condition || '成色良好'}，家用自用非常爱惜，功能一切正常，到手即可用。${kwText ? `主打卖点：${kwText}。` : ''}${price ? `现价 ${price} 元，诚意可小刀，` : '价格可议，'}校园内面交方便，先到先得！手慢无，喜欢的小伙伴速来私聊～`,
    `【${title}】自用转让，${condition || '整体很新'}。因为换了新的/用不上了才出，所以价格超实惠，品质有保障。${kw.length ? `亮点：${kw.join('、')}。` : ''}${price ? `${price} 元即可带回家，` : '白菜价，'}支持面交验货后当面决定，靠谱不坑，欢迎私信咨询！`,
    `闲置【${title}】出一手！${category ? `「${category}」类别，` : ''}${condition || '状态良好'}，没有大毛病，性价比拉满。${kw.length ? `关键词：${kw.join('、')}。` : ''}${price ? `一口价 ${price} 元，` : '价格好商量，'}宿舍/校区当面交易都可以，学生福利价，诚心出，别错过啦～`,
  ];
  return { description: templates[Math.floor(Math.random() * templates.length)], source: 'local' };
}

//
// 2) AI 智能推荐（规则版：基于用户收藏/浏览分类的兴趣相似度）
//    返回 { interestCat(兴趣分类), count, items[], makeup(生成说明) }
//    若未登录或没有偏好，则按最新在售商品 + 全站热门分类兜底
//
function aiRecommend(rawDb, uid) {
  const catCount = {};
  // 从收藏商品取兴趣
  const favRows = rawDb.prepare(
    `SELECT it.category FROM favorites f JOIN items it ON f.item_id = it.id WHERE f.user_id = ?`
  ).all(uid);
  for (const r of favRows) catCount[r.category] = (catCount[r.category] || 0) + 1;

  // 从已下单商品取兴趣
  const orderRows = rawDb.prepare(
    `SELECT it.category FROM orders o JOIN items it ON o.item_id = it.id WHERE o.buyer_id = ?`
  ).all(uid);
  for (const r of orderRows) catCount[r.category] = (catCount[r.category] || 0) + 1.5;

  let interestCat = null;
  let makeups = [];
  if (Object.keys(catCount).length) {
    const sorted = Object.entries(catCount).sort((a, b) => b[1] - a[1]);
    interestCat = sorted[0][0];
    makeups.push(`根据你的收藏/下单记录，重点推荐「${interestCat}」类目`);
  } else {
    makeups.push('你还未收藏任何商品，先按全站热搜与最新好物为你推荐');
  }

  // 取候选：优先兴趣分类在售商品，不足时补充最新在售
  let items = [];
  if (interestCat) {
    items = rawDb.prepare(
      `SELECT it.*, u.nickname AS seller_nickname, u.campus AS seller_campus
       FROM items it JOIN users u ON it.seller_id = u.id
       WHERE it.status = '在售' AND it.category = ?
       ORDER BY it.created_at DESC LIMIT 12`
    ).all(interestCat);
  }
  if (!items.length) {
    items = rawDb.prepare(
      `SELECT it.*, u.nickname AS seller_nickname, u.campus AS seller_campus
       FROM items it JOIN users u ON it.seller_id = u.id
       WHERE it.status = '在售'
       ORDER BY it.created_at DESC LIMIT 12`
    ).all();
    makeups.push('（补充了全站最新在售商品）');
  }

  return { interestCat, count: Object.keys(catCount).length, items, makeup: makeups.join('；') };
}

//
// 3) AI 一键润色：根据 分类 + 一句背景 -> 精炼中文标题 + 3 条卖点
//    云端优先（LLM），失败或未配 key 时本地兜底
//
async function aiPolish({ category, background }) {
  if (!LLM_API_KEY) return localPolish({ category, background });

  const prompt = [
    '你是一位非常懂大学生消费心理的校园二手平台金牌文案。用户会给你商品的分类和一句背景描述。',
    '请输出：1) 一个精炼、吸睛、诚实的商品标题（15 字以内，可带 1 个 emoji）；',
    '2) 恰好 3 条卖点，每条不超过 25 字，突出成色/性价比/实用的真实细节，拒绝夸大。',
    '只输出严格 JSON（不要 markdown 代码块）：{"title":"标题","sellingPoints":["卖点1","卖点2","卖点3"]}，不要任何其他文字。',
    `分类：${category || '未填写'}`,
    `商品背景：${background || '未填写'}`,
  ].join('\n');

  try {
    const resp = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM_API_KEY}` },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      }),
    });
    if (!resp.ok) throw new Error(`LLM 接口返回 ${resp.status}`);
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('LLM 未返回有效内容');
    const parsed = parseJSON(text);
    if (parsed && (parsed.title || parsed.sellingPoints)) {
      return {
        title: String(parsed.title || '').trim(),
        sellingPoints: Array.isArray(parsed.sellingPoints) ? parsed.sellingPoints.slice(0, 3).map(String) : [],
        source: 'llm',
      };
    }
    throw new Error('LLM 返回内容无法解析为 JSON');
  } catch (e) {
    console.warn('[ai] item-copy LLM 失败，回退本地兜底：', e.message);
    return localPolish({ category, background });
  }
}

function parseJSON(text) {
  try { return JSON.parse(text); } catch (e) {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
  return null;
}

function localPolish({ category, background }) {
  const bg = (background || '优质二手好物').trim().slice(0, 24);
  const catP = category && category !== '其他' ? `【${category}】` : '';
  return {
    title: `${catP}${bg.slice(0, 10)}，低价出~`,
    sellingPoints: [
      `${bg.slice(0, 20)}，成色好、到手即用`,
      '性价比拉满，学生党入手不心疼',
      '同校线下面交，可当面验货',
    ],
    source: 'local',
  };
}

module.exports = { aiGenerate, aiRecommend, aiPolish };