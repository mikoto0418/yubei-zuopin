import { useMemo } from "react";

/**
 * 轻量 Markdown 渲染组件（纯手写，无第三方依赖）
 *  - 先 HTML 转义再转 markdown，AI 内容不可信，杜绝 XSS
 *  - 支持：# 标题、**加粗**、*斜体*、行内代码、``` 代码块、
 *  - 无序列表（-、*、·）、1. 有序列表、> 引用、[链接](url)、空行分段
 *  - 用法：<Markdown className="...">{text}</Markdown>
 */

// HTML 转义：把 < > & " 替换为实体，使任何 HTML 标记失去作用
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 行内解析：加粗、斜体、链接（输入为已转义文本，code 片段已抽成占位符）
function inline(html) {
  return html
    // 链接：[文字](url)，url 白名单仅允许 http/https/mailto，防 javascript: 注入
    .replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (_, t, u) => {
      const safe = /^(https?:|mailto:)/i.test(u) ? u : "#";
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${t}</a>`;
    })
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s>(\u0000])\*([^*\n]+)\*(?=[\s<).,;:\u0000]|$)/g, "$1<em>$2</em>")
    .replace(/(^|[\s>(\u0000])_([^_\n]+)_(?=[\s<).,;:\u0000]|$)/g, "$1<em>$2</em>");
}

// 主解析流程
function renderMarkdown(src) {
  const tokens = [];

  // 先抽取代码片段为占位符，避免被加粗/列表等后续规则误处理
  function extract(re) {
    return esc(src).replace(re, (m, code) => {
      const idx = tokens.length;
      tokens.push(code);
      return `\u0000${idx}\u0000`;
    });
  }
  let body = extract(/```[^\n]*\n?([\s\S]*?)\n?```/g); // 代码块
  body = extract(/`([^`\n]+)`/g);                        // 行内代码

  const lines = body.split("\n");
  const out = [];
  let para = [];   // 段落内多行
  let list = [];   // 连续列表项
  let listO = false;

  const flushPara = () => {
    if (para.length) { out.push(`<p>${inline(para.join("<br/>"))}</p>`); para = []; }
  };
  const flushList = () => {
    if (!list.length) return;
    const tag = listO ? "ol" : "ul";
    out.push(`<${tag}>${list.map((li) => `<li>${li}</li>`).join("")}</${tag}>`);
    list = [];
  };

  for (const line of lines) {
    // 空行：结束段落与列表
    if (!line) { flushPara(); flushList(); continue; }

    // 单独的代码块占位符行
    const tok = /^\u0000(\d+)\u0000$/.exec(line);
    if (tok) {
      flushPara(); flushList();
      out.push(`<pre class="md-code"><code>${tokens[+tok[1]]}</code></pre>`);
      continue;
    }

    // # 标题
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { flushPara(); flushList(); const lv = h[1].length; out.push(`<h${lv}>${inline(h[2])}</h${lv}>`); continue; }

    // > 引用
    const bq = /^>\s?(.*)$/.exec(line);
    if (bq) { flushPara(); flushList(); out.push(`<blockquote>${inline(bq[1])}</blockquote>`); continue; }

    // 无序/有序列表
    const ul = /^([-*·]|\d+[.、)])\s+(.*)$/.exec(line);
    if (ul) {
      flushPara();
      const ordered = /^\d+/.test(ul[1]);
      if (list.length && listO !== ordered) flushList();
      listO = ordered;
      list.push(inline(ul[2]));
      continue;
    }

    // 普通文本行 → 归入段落
    flushList();
    para.push(line);
  }
  flushPara(); flushList();

  // 回填代码占位符
  return out.join("\n").replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[+i]);
}

export default function Markdown({ children, className = "" }) {
  const text = children == null ? "" : String(children);
  const html = useMemo(() => renderMarkdown(text), [text]);
  return (
    <div
      className={`markdown ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}