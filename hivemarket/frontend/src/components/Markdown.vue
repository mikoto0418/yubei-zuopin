<template>
  <div class="markdown" v-html="html"></div>
</template>

<script setup>
import { computed } from 'vue';

// 轻量 markdown 渲染器（纯手写，不引依赖）。
// 关键安全点：先对整个字符串做 HTML 转义，再转 markdown，杜绝 XSS。
const props = defineProps({
  source: { type: String, default: '' },
});

// HTML 转义，防止注入 <script> 等
function htmlEscape(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 行内解析：链接 / 加粗 / 斜体 / 行内代码
function renderInline(s) {
  // 行内代码先用占位符藏起来，避免内部符号被二次解析
  const spans = [];
  s = s.replace(/`([^`]+)`/g, (m, code) => {
    spans.push(code);
    return '\u0001C' + (spans.length - 1) + '\u0001';
  });
  // 链接 [文字](url) —— 只允许 http(s)，其余原样显示
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (m, text, url) =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`);
  // 加粗 **
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // 斜体 *（加粗已消费 **，剩余单星视为斜体）
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  // 恢复行内代码
  s = s.replace(/\u0001C(\d+)\u0001/g, (m, i) => `<code>${spans[i]}</code>`);
  return s;
}

const html = computed(() => {
  const source = String(props.source || '');
  if (!source.trim()) return '';
  // 1. 先转义 HTML
  let escaped = htmlEscape(source);

  // 2. 提取围栏代码块 ```lang ... ```，以占位符保护
  const codeTokens = [];
  escaped = escaped.replace(/```[\s\S]*?```/g, (m) => {
    const inner = m.slice(3, -3);
    const nl = inner.indexOf('\n');
    let lang = '';
    let code = inner;
    if (nl !== -1) { lang = inner.slice(0, nl).trim(); code = inner.slice(nl + 1); }
    codeTokens.push(code.replace(/\n$/, ''));
    return '\u0000CODE' + (codeTokens.length - 1) + '\u0000';
  });

  const out = [];
  let paraBuf = [];   // 普通段落缓冲
  let listType = '';  // 'ul' | 'ol' | ''
  let listBuf = [];   // 列表项目缓冲
  let quoteBuf = [];  // 引用缓冲

  const inline = renderInline;

  const closeList = () => {
    if (!listType) return;
    const tag = listType === 'ul' ? 'ul' : 'ol';
    out.push(`<${tag}>${listBuf.map((x) => `<li>${inline(x)}</li>`).join('')}</${tag}>`);
    listBuf = []; listType = '';
  };
  const flushPara = () => {
    if (paraBuf.length) { out.push(`<p>${paraBuf.map(inline).join('\n')}</p>`); paraBuf = []; }
  };
  const closeQuote = () => {
    if (quoteBuf.length) {
      out.push(`<blockquote>${quoteBuf.map((x) => `<p>${inline(x)}</p>`).join('')}</blockquote>`);
      quoteBuf = [];
    }
  };

  const lines = escaped.split('\n');
  for (const raw of lines) {
    const t = raw.trim();
    if (t === '') { closeList(); flushPara(); closeQuote(); continue; }

    // 代码块占位符
    const cb = t.match(/^\u0000CODE(\d+)\u0000$/);
    if (cb) {
      closeList(); flushPara(); closeQuote();
      out.push(`<pre><code>${codeTokens[cb[1]]}</code></pre>`);
      continue;
    }
    // 标题
    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList(); closeQuote(); flushPara();
      const n = h[1].length;
      out.push(`<h${n}>${inline(h[2])}</h${n}>`);
      continue;
    }
    // 引用 >
    const q = t.match(/^>(?:>|\s)?(.*)$/);
    if (q) { closeList(); flushPara(); quoteBuf.push(q[1]); continue; }
    // 无序列表
    const ul = t.match(/^([-*+])\s+(.*)$/);
    if (ul) { closeQuote(); flushPara(); if (listType !== 'ul') closeList(); listType = 'ul'; listBuf.push(ul[2]); continue; }
    // 有序列表 1. / 1)
    const ol = t.match(/^\d+[.)]\s+(.*)$/);
    if (ol) { closeQuote(); flushPara(); if (listType !== 'ol') closeList(); listType = 'ol'; listBuf.push(ol[1]); continue; }
    // 普通段落
    closeList(); closeQuote(); paraBuf.push(raw);
  }
  closeList(); flushPara(); closeQuote();
  return out.join('');
});
</script>

<style scoped>
/* 与项目粗野主义(红黑 + 黄色)风格相融，区别于纯文本 */
.markdown {
  font-size: 15px;
  line-height: 1.7;
  color: var(--black);
  word-break: break-word;
}
.markdown > :first-child { margin-top: 0; }
.markdown > :last-child { margin-bottom: 0; }
.markdown p { margin: 8px 0; }
.markdown h1, .markdown h2, .markdown h3, .markdown h4,
.markdown h5, .markdown h6 {
  font-weight: 900;
  letter-spacing: -0.5px;
  line-height: 1.2;
  margin: 16px 0 8px;
  padding-left: 8px;
  border-left: 4px solid var(--red);
}
.markdown h1 { font-size: 22px; }
.markdown h2 { font-size: 19px; }
.markdown h3 { font-size: 17px; }
.markdown h4 { font-size: 16px; }
.markdown h5, .markdown h6 { font-size: 15px; }
.markdown strong { font-weight: 900; color: var(--red); }
.markdown em { font-style: italic; }
.markdown code {
  background: var(--yellow);
  color: var(--black);
  padding: 1px 5px;
  font-size: 13px;
  border: 2px solid var(--black);
  font-family: "Consolas", "Menlo", monospace;
}
.markdown pre {
  background: var(--black);
  color: var(--paper);
  padding: 12px 14px;
  margin: 12px 0;
  border: 2px solid var(--black);
  overflow-x: auto;
  box-shadow: var(--shadow-sm);
}
.markdown pre code {
  display: block;
  background: transparent;
  color: var(--paper);
  border: none;
  padding: 0;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre;
}
.markdown ul, .markdown ol { margin: 8px 0 8px 22px; }
.markdown li { margin: 3px 0; }
.markdown ul li::marker { color: var(--red); font-weight: 900; }
.markdown ol li::marker { color: var(--red); font-weight: 900; }
.markdown blockquote {
  margin: 12px 0;
  padding: 8px 14px;
  border: 2px solid var(--black);
  border-left: 6px solid var(--yellow);
  background: #fffdf5;
  box-shadow: var(--shadow-sm);
}
.markdown blockquote p { margin: 4px 0; }
.markdown a {
  color: var(--red);
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.markdown a:hover { background: var(--yellow); }
</style>