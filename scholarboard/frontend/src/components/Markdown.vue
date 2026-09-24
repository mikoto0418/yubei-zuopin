<template>
  <!-- 轻量 Markdown 渲染（标题/列表/粗体/行内代码），Apple 排版 -->
  <div class="md" v-html="html" />
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  source: { type: String, default: '' },
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

const html = computed(() => {
  const src = props.source || '';
  if (!src.trim()) return '';
  const lines = escapeHtml(src).split('\n');
  const out = [];
  let inList = false;

  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      const level = Math.min(h[1].length + 1, 5); // h2..h5，页面 h1 留给标题
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }
    const li = /^[-*·]\s+(.*)$/.exec(line);
    if (li) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    if (!line.trim()) { closeList(); continue; }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join('');
});
</script>

<style scoped>
.md {
  font-size: var(--fs-subhead);
  line-height: 1.7;
  color: var(--label);
  word-break: break-word;
}
.md :deep(h2), .md :deep(h3), .md :deep(h4), .md :deep(h5) {
  margin: var(--sp-4) 0 var(--sp-2);
  font-weight: 600;
  letter-spacing: -0.01em;
}
.md :deep(h2) { font-size: var(--fs-title2); }
.md :deep(h3) { font-size: var(--fs-headline); }
.md :deep(h4), .md :deep(h5) { font-size: var(--fs-subhead); }
.md :deep(p) { margin: 0 0 var(--sp-2); }
.md :deep(ul) { margin: 0 0 var(--sp-2); padding-left: var(--sp-5); }
.md :deep(li) { margin-bottom: 2px; }
.md :deep(strong) { font-weight: 600; }
.md :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.92em;
  background: var(--fill-secondary);
  border-radius: var(--radius-sm);
  padding: 1px 5px;
}
</style>
