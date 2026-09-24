import { theme } from "antd";

/**
 * EduPulse · Apple 设计语言令牌
 * 与 src/apple-tokens.css 保持同一套值，供 ConfigProvider 消费。
 */
export const TINT = "#5AC8FA";          // --teal
export const TINT_SOFT = "rgba(90, 200, 250, 0.12)";

export const APPLE = {
  blue: "#007AFF", green: "#34C759", red: "#FF3B30",
  orange: "#FF9500", purple: "#AF52DE", pink: "#FF2D55",
  teal: "#5AC8FA", yellow: "#FFCC00", indigo: "#5856D6",
  gray: "#8E8E93",
  bgGrouped: "#F2F2F7",
  bgSurface: "#FFFFFF",
  label: "rgba(0, 0, 0, 0.92)",
  labelSecondary: "rgba(60, 60, 67, 0.60)",
  separator: "rgba(60, 60, 67, 0.16)",
};

const FONT_STACK = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", ' +
  '"PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", system-ui, sans-serif';

/** 供 ConfigProvider 使用的 antd 主题（Apple 基底，跟随系统深浅色） */
export function buildAppleTheme(dark = false) {
  const base = dark
    ? {
        algorithm: theme.darkAlgorithm,
        colorText: "rgba(255, 255, 255, 0.92)",
        colorTextSecondary: "rgba(235, 235, 245, 0.60)",
        colorBorder: "rgba(84, 84, 88, 0.65)",
        colorBorderSecondary: "rgba(84, 84, 88, 0.45)",
        colorBgBase: "#0D0D0F",
        colorBgContainer: "#1C1C1E",
        colorBgElevated: "#2C2C2E",
        shadow: "0 1px 3px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.3)",
        shadowSecondary: "0 4px 16px rgba(0,0,0,0.5), 0 12px 32px rgba(0,0,0,0.5)",
        headerBg: "rgba(28,28,30,0.72)",
        fillSecondary: "rgba(120,120,128,0.24)",
        fillPrimary: "rgba(120,120,128,0.36)",
        tableHeaderBg: "rgba(120,120,128,0.16)",
        tableRowHover: "rgba(120,120,128,0.14)",
        tableBorder: "rgba(84,84,88,0.45)",
        inputBg: "rgba(120,120,128,0.24)",
      }
    : {
        algorithm: theme.defaultAlgorithm,
        colorText: APPLE.label,
        colorTextSecondary: APPLE.labelSecondary,
        colorBorder: APPLE.separator,
        colorBorderSecondary: "rgba(60, 60, 67, 0.10)",
        colorBgBase: APPLE.bgGrouped,
        colorBgContainer: APPLE.bgSurface,
        colorBgElevated: APPLE.bgSurface,
        shadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)",
        shadowSecondary: "0 4px 16px rgba(0,0,0,0.08), 0 12px 32px rgba(0,0,0,0.08)",
        headerBg: "rgba(255,255,255,0.72)",
        fillSecondary: "rgba(120,120,128,0.08)",
        fillPrimary: "rgba(120,120,128,0.12)",
        tableHeaderBg: "rgba(120,120,128,0.06)",
        tableRowHover: "rgba(120,120,128,0.05)",
        tableBorder: "rgba(60,60,67,0.10)",
        inputBg: "rgba(120,120,128,0.08)",
      };

  return {
    algorithm: base.algorithm,
    token: {
      colorPrimary: TINT,
      colorInfo: APPLE.blue,
      colorSuccess: APPLE.green,
      colorWarning: APPLE.orange,
      colorError: APPLE.red,
      colorText: base.colorText,
      colorTextSecondary: base.colorTextSecondary,
      colorBorder: base.colorBorder,
      colorBorderSecondary: base.colorBorderSecondary,
      colorBgBase: base.colorBgBase,
      colorBgContainer: base.colorBgContainer,
      colorBgElevated: base.colorBgElevated,
      borderRadius: 12,
      borderRadiusLG: 16,
      borderRadiusSM: 8,
      fontSize: 15,
      fontFamily: FONT_STACK,
      boxShadow: base.shadow,
      boxShadowSecondary: base.shadowSecondary,
      controlHeight: 36,
      wireframe: false,
    },
    components: {
      Layout: {
        bodyBg: "transparent",
        headerBg: base.headerBg,
        siderBg: base.colorBgContainer,
        triggerBg: base.fillPrimary,
      },
      Menu: {
        itemBg: "transparent",
        itemColor: base.colorTextSecondary,
        itemHoverColor: base.colorText,
        itemHoverBg: base.fillSecondary,
        itemSelectedColor: TINT,
        itemSelectedBg: dark ? "rgba(90,200,250,0.20)" : TINT_SOFT,
        itemBorderRadius: 12,
        itemHeight: 44,
        itemMarginInline: 8,
      },
      Card: {
        colorBgContainer: base.colorBgContainer,
        borderRadiusLG: 16,
        paddingLG: 20,
        headerFontSize: 17,
        headerHeight: 52,
        colorBorderSecondary: "transparent",
      },
      Table: {
        headerBg: base.tableHeaderBg,
        headerColor: base.colorTextSecondary,
        headerSplitColor: "transparent",
        rowHoverBg: base.tableRowHover,
        borderColor: base.tableBorder,
        colorBgContainer: "transparent",
        footerBg: "transparent",
        cellPaddingBlock: 12,
      },
      Modal: {
        contentBg: base.colorBgContainer,
        headerBg: base.colorBgContainer,
        borderRadiusLG: 22,
        titleFontSize: 17,
      },
      Button: {
        primaryShadow: "none",
        defaultShadow: "none",
        fontWeight: 600,
        defaultBg: base.fillSecondary,
        defaultBorderColor: "transparent",
        defaultColor: TINT,
      },
      Input: {
        colorBgContainer: base.inputBg,
        activeShadow: `0 0 0 4px ${dark ? "rgba(90,200,250,0.24)" : TINT_SOFT}`,
        activeBorderColor: TINT,
        hoverBorderColor: "transparent",
        borderColor: "transparent",
      },
      InputNumber: { colorBgContainer: base.inputBg },
      Select: {
        colorBgContainer: base.inputBg,
        optionSelectedBg: dark ? "rgba(90,200,250,0.20)" : TINT_SOFT,
        borderRadius: 12,
      },
      Progress: { defaultColor: TINT, remainingColor: base.fillPrimary },
      Tabs: { itemSelectedColor: TINT, inkBarColor: TINT, titleFontSize: 15 },
      Tag: {
        defaultBg: base.fillSecondary,
        defaultColor: base.colorTextSecondary,
        borderRadiusSM: 8,
      },
      Statistic: { contentFontSize: 26, titleFontSize: 13 },
      Descriptions: { labelBg: "transparent" },
      Message: { contentBg: base.colorBgContainer },
      Pagination: { itemActiveBg: dark ? "rgba(90,200,250,0.20)" : TINT_SOFT },
      Segmented: { itemSelectedBg: base.colorBgContainer, trackBg: base.fillSecondary },
      Empty: { colorTextDisabled: APPLE.gray },
      Result: { titleFontSize: 24 },
    },
  };
}

/** 默认（浅色）主题，保持向后兼容 */
export const appleTheme = buildAppleTheme(false);

