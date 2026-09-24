const express = require('express');
const { auth, authSoft } = require('../middleware/auth');
const db = require('../db');
const { aiGenerate, aiRecommend, aiPolish } = require('../services/aiService');

const router = express.Router();

// AI 智能上架：根据 标题/分类/关键词 + 可选卖家人设，生成吸引人的商品描述
router.post('/item-desc', auth, async (req, res) => {
  const { title, category, keywords, condition, price } = req.body || {};
  if (!title) return res.status(400).json({ message: '请先填写商品标题' });
  try {
    const result = await aiGenerate({ title, category, keywords, condition, price });
    res.json({ description: result.description, source: result.source });
  } catch (e) {
    res.status(500).json({ message: `AI 生成失败：${e.message}` });
  }
});

// AI 一键润色：根据 分类 + 一句背景 -> 精炼中文标题 + 3 条卖点
// 云端走 Agnes（.env 的 LLM_BASE_URL/LLM_MODEL），失败或未配 key 时本地兜底
router.post('/item-copy', auth, async (req, res) => {
  const { category, background } = req.body || {};
  if (!background || !background.trim()) {
    return res.status(400).json({ message: '请填写商品背景描述（分类 + 一句话）' });
  }
  try {
    const result = await aiPolish({ category, background: background.trim() });
    res.json(result);
  } catch (e) {
    res.status(500).json({ message: `AI 润色失败：${e.message}` });
  }
});

// AI 智能推荐：根据用户浏览/收藏 + 分类相似度返回卡片一组推荐商品
router.get('/recommend', authSoft, (req, res) => {
  const uid = req.userId || null;
  const limit = Math.min(Number(req.query.limit) || 12, 20);
  let interests;
  if (uid) interests = aiRecommend(db, uid);
  else interests = { category: '数码电子', count: 0 };
  res.json({ interests, items: interests.items || [], makeup: interests.makeup });
});

module.exports = router;