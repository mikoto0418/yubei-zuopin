import React from "react";

// 轻量 Markdown 渲染：先 HTML 转义（防 XSS），再转标记。
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inline(s) {
  let x = esc(s);
  x = x.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  x = x.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  x = x.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  x = x.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return x;
}

export function renderMarkdown(md) {
  const lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let listType = null; // "ul" | "ol"
  let code = false;
  let codeBuf = [];

  const closeCode = () => {
    if (code) { html += "<pre><code>" + codeBuf.join("\n") + "</code></pre>"; code = false; codeBuf = []; }
  };
  const closeList = () => {
    if (listType) { html += "</" + (listType === "ol" ? "ol" : "ul") + ">"; listType = null; }
  };

  for (const raw of lines) {
    const t = raw.trim();
    if (t.startsWith("```")) {
      closeList();
      if (code) closeCode(); else { code = true; codeBuf = []; }
      continue;
    }
    if (code) { codeBuf.push(esc(raw)); continue; }

    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) { closeList(); html += "<h" + h[1].length + ">" + inline(h[2]) + "</h" + h[1].length + ">"; continue; }

    const m = t.match(/^\s*[-*·]\s+(.*)$/);
    if (m) {
      if (listType !== "ul") { closeList(); listType = "ul"; html += "<ul>"; }
      html += "<li>" + inline(m[1]) + "</li>"; continue;
    }
    const o = t.match(/^\s*\d+[.)]\s+(.*)$/);
    if (o) {
      if (listType !== "ol") { closeList(); listType = "ol"; html += "<ol>"; }
      html += "<li>" + inline(o[1]) + "</li>"; continue;
    }
    const q = t.match(/^>\s?(.*)$/);
    if (q) { closeList(); html += "<blockquote>" + inline(q[1]) + "</blockquote>"; continue; }

    closeList();
    html += t === "" ? "<p><br></p>" : "<p>" + inline(raw) + "</p>";
  }
  closeList();
  closeCode();
  return html;
}

export default function Markdown({ text }) {
  return <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
}