// AI 服务统一入口：配置了 LLM_API_KEY 走真实大模型，未配置自动降级为本地规则引擎。
// 响应体始终带 source 字段（llm / local），前端可据此展示引擎来源。
'use strict';

const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_BASE_URL = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';
const LLM_TIMEOUT = parseInt(process.env.LLM_TIMEOUT, 10) || 20000;

function hasLLM() {
  return Boolean(LLM_API_KEY);
}

// 调用 OpenAI 兼容的 chat/completions。失败抛异常，由调用方决定是否降级。
async function callLLM(messages, { temperature = 0.7, maxTokens = 800 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT);
  try {
    const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({ model: LLM_MODEL, messages, temperature, max_tokens: maxTokens }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LLM ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM 返回内容为空');
    return content.trim();
  } finally {
    clearTimeout(timer);
  }
}

// 统一的"先试大模型、失败降级本地规则"入口。
// buildLocal 是必传的降级函数，保证离线也能演示。
async function generate(messages, buildLocal, opts = {}) {
  if (hasLLM()) {
    try {
      const text = await callLLM(messages, opts);
      return { text, source: 'llm' };
    } catch (e) {
      console.warn('[ai] 大模型调用失败，降级本地规则：', e.message);
    }
  }
  const text = typeof buildLocal === 'function' ? buildLocal() : String(buildLocal || '');
  return { text, source: 'local' };
}

module.exports = { hasLLM, callLLM, generate, LLM_MODEL, LLM_BASE_URL };
