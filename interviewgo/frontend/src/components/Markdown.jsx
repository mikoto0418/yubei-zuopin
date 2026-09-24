import { Box } from '@mui/material';

// 轻量 Markdown 渲染：支持标题 / 粗体 / 斜体 / 行内代码 / 代码块 / 有序与无序列表 / 引用 / 分割线 / 链接。
// 不引入第三方依赖，先转义 HTML 再按行解析，避免 XSS。

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inline(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  return out;
}

function renderLines(src) {
  const lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let i = 0;
  let listType = null;

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      closeList();
      const lang = line.trim().replace(/^```/, '').trim();
      const buf = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      html.push(
        `<pre class="md-pre"${lang ? ` data-lang="${escapeHtml(lang)}"` : ''}><code>${escapeHtml(buf.join('\n'))}</code></pre>`,
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const lv = heading[1].length;
      html.push(`<h${lv} class="md-h md-h${lv}">${inline(heading[2])}</h${lv}>`);
      i += 1;
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      closeList();
      html.push('<hr class="md-hr" />');
      i += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      closeList();
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      html.push(`<blockquote class="md-quote">${inline(buf.join(' '))}</blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      if (listType !== 'ul') {
        closeList();
        html.push('<ul class="md-ul">');
        listType = 'ul';
      }
      html.push(`<li>${inline(line.replace(/^\s*[-*+]\s+/, ''))}</li>`);
      i += 1;
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      if (listType !== 'ol') {
        closeList();
        html.push('<ol class="md-ol">');
        listType = 'ol';
      }
      html.push(`<li>${inline(line.replace(/^\s*\d+[.)]\s+/, ''))}</li>`);
      i += 1;
      continue;
    }

    if (!line.trim()) {
      closeList();
      i += 1;
      continue;
    }

    closeList();
    const buf = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !/^\s*(```|#{1,6}\s|[-*+]\s|\d+[.)]\s|>)/.test(lines[i])) {
      buf.push(lines[i]);
      i += 1;
    }
    html.push(`<p class="md-p">${inline(buf.join(' '))}</p>`);
  }

  closeList();
  return html.join('');
}

export default function Markdown({ children, sx }) {
  const html = renderLines(children);
  return (
    <Box
      className="ig-markdown"
      sx={{
        fontSize: 15,
        lineHeight: 1.6,
        letterSpacing: '-0.01em',
        wordBreak: 'break-word',
        '& .md-p': { my: 0.4 },
        '& .md-p:first-of-type': { mt: 0 },
        '& .md-p:last-of-type': { mb: 0 },
        '& .md-h': { mt: 1.2, mb: 0.5, fontWeight: 600, lineHeight: 1.4 },
        '& .md-h1': { fontSize: 22 },
        '& .md-h2': { fontSize: 17 },
        '& .md-h3': { fontSize: 17 },
        '& .md-h4,& .md-h5,& .md-h6': { fontSize: 15 },
        '& .md-ul,& .md-ol': { my: 0.4, pl: 2.2 },
        '& li': { mb: 0.3 },
        '& .md-hr': { my: 1.2, border: 0, borderTop: '1px solid', borderColor: 'divider' },
        '& .md-quote': {
          my: 0.8,
          mx: 0,
          pl: 1.4,
          borderLeft: '2px solid',
          borderColor: 'divider',
          color: 'text.secondary',
        },
        '& .md-inline-code': {
          px: 0.6,
          py: 0.15,
          borderRadius: '6px',
          bgcolor: 'action.hover',
          color: 'primary.main',
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
        },
        '& .md-pre': {
          my: 0.8,
          p: 1.4,
          borderRadius: '12px',
          bgcolor: 'action.hover',
          color: 'text.primary',
          overflowX: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          lineHeight: 1.7,
        },
        '& strong': { fontWeight: 600 },
        ...sx,
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
