// ScholarBoard · Naive UI 主题覆盖（Apple 设计语言基底）
// 令牌来源：_pipeline/apple-tokens.css（本文件只做「库 → 令牌」的映射，不新造色值）
// 主题色：--orange（#FF9500）；圆角、字体、阴影全部压到 Apple 规范。

// Naive UI 需要静态字符串（无法用 CSS 变量），故在此以常量形式复述令牌值。
export const T = {
  // 系统色
  orange: '#FF9500',
  orangeHover: '#FFA726',
  orangePressed: '#E08600',
  orangeSoft: 'rgba(255, 149, 0, 0.12)',
  blue: '#007AFF',
  green: '#34C759',
  red: '#FF3B30',
  yellow: '#FFCC00',
  // 中性阶（浅色）
  label: 'rgba(0, 0, 0, 0.92)',
  labelSecondary: 'rgba(60, 60, 67, 0.60)',
  labelTertiary: 'rgba(60, 60, 67, 0.30)',
  separator: 'rgba(60, 60, 67, 0.16)',
  fillPrimary: 'rgba(120, 120, 128, 0.12)',
  fillSecondary: 'rgba(120, 120, 128, 0.08)',
  bgGrouped: '#F2F2F7',
  bgSurface: '#FFFFFF',
  bgElevated: '#FFFFFF',
};

// 深色模式令牌
export const T_DARK = {
  label: 'rgba(255, 255, 255, 0.92)',
  labelSecondary: 'rgba(235, 235, 245, 0.60)',
  labelTertiary: 'rgba(235, 235, 245, 0.30)',
  separator: 'rgba(84, 84, 88, 0.65)',
  fillPrimary: 'rgba(120, 120, 128, 0.36)',
  fillSecondary: 'rgba(120, 120, 128, 0.24)',
  bgGrouped: '#0D0D0F',
  bgSurface: '#1C1C1E',
  bgElevated: '#2C2C2E',
};

// Apple 字体族
export const FONT_SANS =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", system-ui, sans-serif';
export const FONT_MONO = '"SF Mono", ui-monospace, Menlo, Consolas, monospace';

// 圆角档位（§2.3）
export const R = { sm: '8px', md: '12px', lg: '16px', xl: '22px', full: '999px' };

// 阴影：仅两档，极克制（§2.3）
const SHADOW_1 = '0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.04)';
const SHADOW_2 = '0 4px 16px rgba(0, 0, 0, 0.08), 0 12px 32px rgba(0, 0, 0, 0.08)';
const SHADOW_D1 = '0 1px 3px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.3)';
const SHADOW_D2 = '0 4px 16px rgba(0, 0, 0, 0.5), 0 12px 32px rgba(0, 0, 0, 0.5)';

// 动效令牌（§2.6）
const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

function buildOverrides(c, shadow1, shadow2) {
  return {
    common: {
      primaryColor: T.orange,
      primaryColorHover: T.orangeHover,
      primaryColorPressed: T.orangePressed,
      primaryColorSuppl: T.orangeHover,
      infoColor: T.blue,
      successColor: T.green,
      warningColor: T.orange,
      errorColor: T.red,
      textColorBase: c.label,
      textColor1: c.label,
      textColor2: c.labelSecondary,
      textColor3: c.labelTertiary,
      placeholderColor: c.labelTertiary,
      borderColor: c.separator,
      dividerColor: c.separator,
      bodyColor: c.bgGrouped,
      cardColor: c.bgSurface,
      modalColor: c.bgElevated,
      popoverColor: c.bgElevated,
      tableColor: c.bgSurface,
      tableHeaderColor: c.bgSurface,
      inputColor: c.fillSecondary,
      actionColor: c.bgGrouped,
      hoverColor: 'rgba(255, 149, 0, 0.06)',
      // 圆角全部走 Apple 档位
      borderRadius: R.md,
      borderRadiusSmall: R.sm,
      fontFamily: FONT_SANS,
      fontFamilyMono: FONT_MONO,
      // 字号阶梯（§2.1）
      fontSize: '15px',
      fontSizeSmall: '13px',
      fontSizeMedium: '15px',
      fontSizeLarge: '17px',
      fontWeightStrong: '600',
      heightMedium: '36px',
      heightLarge: '44px',
      boxShadow1: shadow1,
      boxShadow2: shadow2,
      boxShadow3: shadow2,
      scrollbarColor: c.fillPrimary,
      scrollbarColorHover: c.fillSecondary,
      scrollbarBorderRadius: R.full,
      cubicBezierEaseInOut: EASE,
    },
    Layout: {
      color: c.bgGrouped,
      textColor: c.label,
      headerColor: c.bgSurface,
      headerBorderColor: c.separator,
      siderColor: c.bgSurface,
      siderBorderColor: c.separator,
      footerColor: c.bgGrouped,
    },
    Menu: {
      itemColorActive: T.orangeSoft,
      itemColorActiveHover: T.orangeSoft,
      itemColorHover: 'rgba(255, 149, 0, 0.06)',
      itemTextColor: c.labelSecondary,
      itemTextColorHover: c.label,
      itemTextColorActive: T.orange,
      itemTextColorActiveHover: T.orange,
      itemTextColorChildActive: T.orange,
      itemIconColor: c.labelSecondary,
      itemIconColorHover: c.label,
      itemIconColorActive: T.orange,
      itemIconColorActiveHover: T.orange,
      arrowColor: c.labelTertiary,
      arrowColorActive: T.orange,
      groupTextColor: c.labelTertiary,
      borderRadius: R.sm,
      itemHeight: '38px',
      fontSize: '15px',
    },
    Card: {
      borderRadius: R.lg,
      color: c.bgSurface,
      borderColor: 'transparent',
      textColor: c.label,
      titleTextColor: c.label,
      titleFontWeight: '600',
      titleFontSizeMedium: '17px',
      titleFontSizeLarge: '17px',
      paddingMedium: '20px',
      paddingLarge: '20px',
      lineHeight: '1.5',
      boxShadow: shadow1,
      border: 'none',
    },
    Button: {
      borderRadiusTiny: R.sm,
      borderRadiusSmall: R.sm,
      borderRadiusMedium: R.md,
      borderRadiusLarge: R.md,
      fontWeight: '600',
      fontSizeMedium: '15px',
      textColor: c.labelSecondary,
      textColorHover: c.label,
      textColorPrimary: '#FFFFFF',
      textColorHoverPrimary: '#FFFFFF',
      textColorPressedPrimary: '#FFFFFF',
      color: c.fillSecondary,
      colorHover: c.fillPrimary,
      colorPressed: c.fillPrimary,
      colorPrimary: T.orange,
      colorHoverPrimary: T.orangeHover,
      colorPressedPrimary: T.orangePressed,
      border: 'none',
      borderHover: 'none',
      borderPressed: 'none',
      borderFocus: 'none',
      borderPrimary: 'none',
      borderHoverPrimary: 'none',
      borderPressedPrimary: 'none',
      borderFocusPrimary: 'none',
      rippleColor: T.orange,
    },
    Input: {
      borderRadius: R.md,
      color: c.fillSecondary,
      colorFocus: c.fillSecondary,
      border: '2px solid transparent',
      borderHover: '2px solid transparent',
      borderFocus: `2px solid ${T.orange}`,
      boxShadowFocus: `0 0 0 4px ${T.orangeSoft}`,
      textColor: c.label,
      placeholderColor: c.labelTertiary,
      caretColor: T.orange,
    },
    Form: {
      labelTextColor: c.labelSecondary,
      labelFontWeight: '600',
      labelFontSizeTopMedium: '13px',
      feedbackTextColorError: T.red,
      feedbackTextColorWarning: T.orange,
    },
    DataTable: {
      thColor: c.bgSurface,
      thColorHover: c.bgGrouped,
      thTextColor: c.labelSecondary,
      thFontWeight: '600',
      tdColor: c.bgSurface,
      tdColorHover: c.bgGrouped,
      tdColorStriped: c.bgSurface,
      tdTextColor: c.label,
      borderColor: c.separator,
      borderRadius: R.md,
      fontSizeSmall: '13px',
      fontSizeMedium: '15px',
      lineHeight: '1.5',
    },
    Tag: {
      borderRadius: R.sm,
      color: c.fillSecondary,
      textColor: c.labelSecondary,
      border: 'none',
      heightSmall: '24px',
      fontSizeSmall: '13px',
      paddingSmall: '0 8px',
    },
    Drawer: {
      color: c.bgElevated,
      textColor: c.label,
      titleTextColor: c.label,
      titleFontSize: '17px',
      boxShadow: shadow2,
      headerPadding: '20px 20px 12px',
      bodyPadding: '8px 20px 20px',
      footerPadding: '14px 20px 20px',
      borderRadius: R.xl,
      closeIconColor: c.labelSecondary,
      closeIconColorHover: T.orange,
    },
    Modal: {
      color: c.bgElevated,
      textColor: c.label,
      titleTextColor: c.label,
      titleFontSize: '17px',
      titleFontWeight: '600',
      borderRadius: R.xl,
      headerPadding: '20px 20px 12px',
      bodyPadding: '8px 20px 20px',
      footerPadding: '14px 20px 20px',
      boxShadow: shadow2,
    },
    Dialog: {
      borderRadius: R.xl,
      color: c.bgElevated,
      textColor: c.label,
      titleTextColor: c.label,
      titleFontSize: '17px',
      fontSize: '15px',
      padding: '20px',
      boxShadow: shadow2,
    },
    Select: {
      peers: {
        InternalSelection: {
          borderRadius: R.md,
          border: '2px solid transparent',
          borderHover: '2px solid transparent',
          borderFocus: `2px solid ${T.orange}`,
          borderActive: `2px solid ${T.orange}`,
          boxShadowFocus: `0 0 0 4px ${T.orangeSoft}`,
          boxShadowActive: `0 0 0 4px ${T.orangeSoft}`,
          textColor: c.label,
          placeholderColor: c.labelTertiary,
          color: c.fillSecondary,
        },
        InternalSelectMenu: {
          borderRadius: R.lg,
          color: c.bgElevated,
          optionTextColor: c.labelSecondary,
          optionTextColorActive: T.orange,
          optionColorPending: c.fillSecondary,
          optionColorActive: T.orangeSoft,
          optionColorActivePending: T.orangeSoft,
          boxShadow: shadow2,
          border: 'none',
        },
      },
    },
    DatePicker: {
      panelColor: c.bgElevated,
      itemBorderRadius: R.sm,
      itemColorActive: T.orangeSoft,
      itemColorActiveHover: T.orangeSoft,
      itemTextColorActive: T.orange,
      itemTextColorActiveHover: T.orange,
      textColor: c.label,
      calendarTitleTextColor: c.label,
      borderRadius: R.lg,
      panelBoxShadow: shadow2,
    },
    Pagination: {
      itemBorderRadius: R.sm,
      itemColor: 'transparent',
      itemColorActive: T.orange,
      itemColorHover: T.orangeSoft,
      itemTextColor: c.labelSecondary,
      itemTextColorActive: '#FFFFFF',
      itemTextColorHover: T.orange,
      itemBorder: 'none',
      itemBorderActive: 'none',
      itemBorderHover: 'none',
    },
    Switch: {
      railColor: c.fillPrimary,
      railColorActive: T.orange,
      buttonColor: '#FFFFFF',
      boxShadowFocus: `0 0 0 4px ${T.orangeSoft}`,
      railHeight: '31px',
      railWidth: '51px',
      buttonHeight: '27px',
      buttonWidth: '27px',
    },
    Empty: {
      textColor: c.labelTertiary,
      iconColor: c.labelTertiary,
      fontSizeMedium: '15px',
      iconSizeMedium: '38px',
    },
    Spin: {
      color: T.orange,
      textColor: c.labelSecondary,
    },
    Message: {
      color: c.bgElevated,
      textColor: c.label,
      borderRadius: R.full,
      boxShadow: shadow2,
      contentPadding: '10px 20px',
      iconColorInfo: T.blue,
      iconColorSuccess: T.green,
      iconColorWarning: T.orange,
      iconColorError: T.red,
      iconColorLoading: T.orange,
    },
    Result: {
      titleFontSizeMedium: '22px',
      textColor: c.labelSecondary,
    },
    Checkbox: {
      borderRadius: R.sm,
      colorChecked: T.orange,
      border: `2px solid ${c.labelTertiary}`,
      borderChecked: `2px solid ${T.orange}`,
      borderFocus: `2px solid ${T.orange}`,
      boxShadowFocus: `0 0 0 4px ${T.orangeSoft}`,
    },
    Progress: {
      railColor: c.fillSecondary,
      fillColor: T.orange,
    },
    Tabs: {
      tabTextColorActiveLine: T.orange,
      tabTextColorHoverLine: T.orangeHover,
      barColor: T.orange,
      tabBorderColor: c.separator,
    },
    Divider: { color: c.separator },
    Dropdown: {
      borderRadius: R.lg,
      color: c.bgElevated,
      optionTextColor: c.label,
      optionTextColorActive: T.orange,
      optionColorHover: c.fillSecondary,
      boxShadow: shadow2,
    },
    Tooltip: {
      borderRadius: R.sm,
      color: c.bgElevated,
      textColor: c.label,
      boxShadow: shadow2,
    },
  };
}

export const appleLightOverrides = buildOverrides(
  { label: T.label, labelSecondary: T.labelSecondary, labelTertiary: T.labelTertiary, separator: T.separator, fillPrimary: T.fillPrimary, fillSecondary: T.fillSecondary, bgGrouped: T.bgGrouped, bgSurface: T.bgSurface, bgElevated: T.bgElevated },
  SHADOW_1,
  SHADOW_2
);

export const appleDarkOverrides = buildOverrides(
  { label: T_DARK.label, labelSecondary: T_DARK.labelSecondary, labelTertiary: T_DARK.labelTertiary, separator: T_DARK.separator, fillPrimary: T_DARK.fillPrimary, fillSecondary: T_DARK.fillSecondary, bgGrouped: T_DARK.bgGrouped, bgSurface: T_DARK.bgSurface, bgElevated: T_DARK.bgElevated },
  SHADOW_D1,
  SHADOW_D2
);

// 项目/标签色板：只取 Apple 系统色，供颜色选择器与色点使用
export const PALETTE = [
  { key: 'orange', label: '橙', value: T.orange },
  { key: 'blue', label: '蓝', value: T.blue },
  { key: 'green', label: '绿', value: T.green },
  { key: 'purple', label: '紫', value: '#AF52DE' },
  { key: 'pink', label: '粉', value: '#FF2D55' },
  { key: 'teal', label: '青', value: '#5AC8FA' },
  { key: 'indigo', label: '靛', value: '#5856D6' },
  { key: 'yellow', label: '黄', value: T.yellow },
];

export const PALETTE_MAP = PALETTE.reduce((acc, p) => { acc[p.key] = p.value; return acc; }, {});

export function colorOf(key) {
  return PALETTE_MAP[key] || T.orange;
}

export default appleLightOverrides;
