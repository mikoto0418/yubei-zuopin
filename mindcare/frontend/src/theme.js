// MindCare 设计令牌层 —— Apple 基底 + 粉色主题
// 颜色 / 圆角 / 阴影集中在此，避免散落硬编码。
// 字体栈、字号阶梯、中性色一律来自 apple-tokens.css，此处不重复定义。

export const BRAND = "#FF2D55";        // Apple System Pink（= --pink）
export const BRAND_SOFT = "#FF6482";   // 浅一档，用于图表辅色

export const PALETTE = {
  positive: "#34C759",   // --green
  neutral: "#8E8E93",    // --gray
  negative: "#FF3B30",   // --red
};

// 情绪标签可选色板（取自 Apple System Colors）
export const SWATCHES = [
  "#FF2D55", "#FF9500", "#FFCC00", "#34C759",
  "#5AC8FA", "#007AFF", "#5856D6", "#AF52DE", "#8E8E93",
];

// 极浅两档阴影，与 apple-tokens.css 对齐（供 ECharts / 内联样式复用）
export const SHADOW = {
  card: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)",
  float: "0 4px 16px rgba(0,0,0,0.08), 0 12px 32px rgba(0,0,0,0.08)",
};

export const APPLE_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", system-ui, sans-serif';

// Mantine 主题：主色 = Apple Pink，圆角 lg，字体走 Apple 栈，阴影只留两档
export const mantineTheme = {
  primaryColor: "mindcare",
  primaryShade: 6,
  defaultRadius: "lg",
  fontFamily: APPLE_FONT,
  headings: {
    fontFamily: APPLE_FONT,
    fontWeight: "700",
    sizes: {
      h1: { fontSize: "34px", lineHeight: "1.2", fontWeight: "700" },
      h2: { fontSize: "22px", lineHeight: "1.3", fontWeight: "600" },
      h3: { fontSize: "17px", lineHeight: "1.4", fontWeight: "600" },
    },
  },
  fontSizes: {
    xs: "12px",
    sm: "13px",
    md: "15px",
    lg: "17px",
    xl: "22px",
  },
  colors: {
    // Apple Pink #FF2D55 的 10 档
    mindcare: [
      "#fff0f3", "#ffe0e7", "#ffc2ce", "#ff9db1", "#ff7895",
      "#ff5679", "#ff2d55", "#e6003d", "#bf0033", "#990029",
    ],
    // 语义色别名，便于 <Badge color="blush">
    blush: [
      "#fff0f3", "#ffe0e7", "#ffc2ce", "#ff9db1", "#ff7895",
      "#ff5679", "#ff2d55", "#e6003d", "#bf0033", "#990029",
    ],
  },
  shadows: {
    xs: "0 1px 2px rgba(0,0,0,0.04)",
    md: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)",
  },
  other: {
    cardShadow: SHADOW.card,
    floatShadow: SHADOW.float,
  },
};

// 情绪分类（与后端 kind 字段对应）
export const KIND = {
  positive: { label: "积极", color: PALETTE.positive, emoji: "👍" },
  neutral: { label: "中性", color: PALETTE.neutral, emoji: "🙂" },
  negative: { label: "消极", color: PALETTE.negative, emoji: "👎" },
};

export const DEFAULT_EMOJI = "🏷️";
export const SEGMENT_COLORS = SWATCHES;

// 预约状态机展示元数据
export const APPT_STATUS = {
  pending: { label: "待确认", color: "yellow", hint: "等待咨询师确认" },
  confirmed: { label: "已确认", color: "blue", hint: "咨询师已确认，请准时参加" },
  completed: { label: "已完成", color: "green", hint: "咨询已完成，欢迎评价" },
  cancelled: { label: "已取消", color: "gray", hint: "预约已取消" },
};

// 危机预警等级元数据
export const ALERT_LEVEL = {
  high: { label: "高危", color: "red" },
  medium: { label: "中度", color: "orange" },
  low: { label: "轻度", color: "yellow" },
};

export const ALERT_STATUS = {
  open: { label: "待处理", color: "red" },
  handled: { label: "已处理", color: "green" },
  dismissed: { label: "已解除", color: "gray" },
};

export const ALERT_ACTION = {
  contact: "联系本人",
  refer: "转介",
  dismiss: "解除预警",
};
