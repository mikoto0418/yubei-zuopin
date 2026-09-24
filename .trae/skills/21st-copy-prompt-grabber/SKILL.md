---
name: "21st-copy-prompt-grabber"
description: "对 21st.dev 组件进行不限量的 'Copy prompt' 抓取与落地集成。无 21st 订阅额度时，用已登录 Chrome 经 CDP 打开组件详情页复制 prompt、base64 解码归档，再改写成项目技术栈。当需要从 21st 取组件、绕过 get_component 免费额度、批量套组件或抄某个组件样式时调用。"
---

# 21st.dev Copy Prompt 批量抓取

无 21st 付费订阅时，`get_component` 每日免费额度有限（通常 2 次）。但每个组件详情页的 **Copy prompt** 按钮内容是免费的、可无限复制的。此 skill 通过已登录的 Chrome（CDP）打开组件页，复制 prompt，base64 解码落盘，再改写进目标项目。

## 适用场景
- 需要用 21st 组件但免费额度已用完（`get_usage` 显示 `X/X remaining` 为 0）。
- 需要一次性拿下多个组件（Hero、导航、卡片、登录页等）做批量美化。
- 目标项目技术栈（JSX+CSS、Vue、Angular…）与 21st 的 `Tailwind + shadcn + TS` 不一致，需要源码做改写参考。

## 前置条件
- 本机已装 Google Chrome，21st.dev 已登录（浏览器复用登录态）。
- `agent-browser` 已全局安装：`npm install -g agent-browser`。
- CDP 脚本路径（skill-mode）：
  - Windows: `c:\Users\Lenovo\.trae-cn\skills\browser-cdp\scripts\setup-cdp-chrome.js`
  - 其他：`{browser-cdp-skill-dir}/scripts/setup-cdp-chrome.js`

## 高优先级规则

### 1. 必须先探测、必须征得同意
启动/重启会 kill 用户现有 Chrome。规则：
- 先 `--detect-only` 探测。
- `CDP_STATUS=ready` → 直接复用，不重启。
- `needs-setup 且 CHROME_RUNNING=no` → 安全启动。
- `needs-setup 且 CHROME_RUNNING=yes` → **先经 AskUserQuestion 征得同意**（会杀掉 N 个 Chrome 进程，可能丢未保存标签页），同意后再 `--yes` 启动。绝不在未同意时强传 `--yes`。

### 2. 覆盖现工作室/套组件时，先确认技术栈差异
21st 组件是 `Tailwind + shadcn + TypeScript`。若目标项目是纯 JSX+CSS，不应直接粘贴（缺 Tailwind 会全部失样式）。默认路线：**参照 21st 的视觉/结构，用目标项目的现有 CSS 类重写**。当需要「原汁原味」时才为目标项目引入 Tailwind+shadcn。

## 操作流程

### Step 1 探测 CDP
```bash
node {SETUP_SCRIPT} 9222 --detect-only
```

### Step 2 启动（按探测结果分支）
```bash
node {SETUP_SCRIPT} 9222 --yes   # 已征得同意
```

### Step 3 找组件（免费不限量，先于 get_component）
MCP `search` / `search_picker` 免费、不限次数，返回元数据（含 id、install URL、预览图）。
```json
mcp_21st.search { "query": "<需要什么>", "type": "component", "limit": 8 }
```

### Step 4 打开组件详情页并复制 prompt
组件详情页 URL 即安装 URL，例如 `https://21st.dev/r/{author}/{slug}`。
```bash
agent-browser --cdp 9222 open "https://21st.dev/r/{author}/{slug}"
agent-browser --cdp 9222 wait 3000
```

### Step 5 定位 "Copy prompt" 并提取 base64
`Copy prompt` 按钮通常藏在组件卡片的某操作区域。先 snapshot 拿到引用再点，之后在日志里找 base64：
```bash
agent-browser --cdp 9222 snapshot -i
agent-browser --cdp 9222 click "<Copy prompt 按钮选择器>"
agent-browser --cdp 9222 wait 1000
```
日志内会输出形如 `"BASE64:..."` 的字符串（见 `browser-logs/evaluate-*.log`）。取其 base64（先 trim 首尾引号），再解码：
```bash
# PowerShell
[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String((Get-Content <log> -Raw).Trim().Trim('"')))
```

> 若日志输出被截断：提取完整 base64（去掉首尾引号）再解码，勿用半截字符串（会报 Incorrect padding）。

### Step 6 归档
把解码后的完整 prompt（含 TSX 源码 + Demo + install 命令）落盘到 `21st-prompts/mcp-captured/{slug}-{id}.md` 或按项目归目录，便于后续改写。

## 落地集成（改写而非硬贴）
对纯 JSX+CSS 项目：
1. 读目标页面 + `styles.css`，掌握现有类（如 `glass/card/nav-btn/page-title`）与主题变量（如 `--accent`）。
2. 把 21st 组件的 JSX 结构翻译成现有类名，用项目主题色替代 Tailwind 色板。
3. 在 `styles.css` 追加所需新类（气泡、分布条、玻璃导航、Hero 等），命名带前缀避免冲突。
4. `npm run build` 验证；构建通过再算落地成功。

## 失败处理
- CDP 连接断开/超时：核验 debug profile 对应 PID 只杀该实例；`--reset --yes` 重置登录态后再试（reset 也需先征得同意）。
- M 每日配额刷新：`02:00`（UTC）后 `get_component` 会恢复额度；优先用 copy-prompt 方式即不受此限。
- 多个组件批量抓：每个组件独立超时（30s），失败从断点继续。