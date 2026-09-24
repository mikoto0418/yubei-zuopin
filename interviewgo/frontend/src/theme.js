import { createTheme } from '@mui/material/styles';

// InterviewGo 主题：Apple 设计基底 + --purple 主题色。
// 差异化维度 = 对话流 + 气泡节奏：只有气泡，没有卡片。
export const APPLE_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", system-ui, sans-serif';

// 阴影只保留两档，且极浅（Apple 规范 §2.3）
const SHADOWS = [
  'none',
  '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
  '0 4px 16px rgba(0,0,0,0.08), 0 12px 32px rgba(0,0,0,0.08)',
];

function buildShadows() {
  const arr = new Array(25).fill('none');
  arr[0] = 'none';
  for (let i = 1; i <= 12; i += 1) arr[i] = SHADOWS[1];
  for (let i = 13; i <= 24; i += 1) arr[i] = SHADOWS[2];
  return arr;
}

/** 读取系统深色偏好，用于生成对应主题（深色模式自动切换，无闪烁） */
export function prefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function buildTheme(dark = false) {
  return createTheme({
    palette: {
      mode: dark ? 'dark' : 'light',
      primary: { main: '#AF52DE', light: '#C77DE8', dark: '#8E3FB8', contrastText: '#ffffff' },
      secondary: { main: '#5856D6' },
      success: { main: '#34C759' },
      warning: { main: '#FF9500' },
      error: { main: '#FF3B30' },
      info: { main: '#007AFF' },
      background: {
        default: dark ? '#000000' : '#F2F2F7',
        paper: dark ? '#1C1C1E' : '#FFFFFF',
      },
      text: {
        primary: dark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.92)',
        secondary: dark ? 'rgba(235,235,245,0.60)' : 'rgba(60,60,67,0.60)',
        disabled: dark ? 'rgba(235,235,245,0.30)' : 'rgba(60,60,67,0.30)',
      },
      divider: dark ? 'rgba(84,84,88,0.65)' : 'rgba(60,60,67,0.16)',
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: APPLE_FONT,
      // 严格按 Apple HIG 字号阶梯，不自创字号
      h4: { fontSize: 34, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em' },
      h5: { fontSize: 22, fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.02em' },
      h6: { fontSize: 17, fontWeight: 600, lineHeight: 1.4, letterSpacing: '-0.01em' },
      subtitle1: { fontSize: 17, fontWeight: 600, lineHeight: 1.4 },
      subtitle2: { fontSize: 15, fontWeight: 600, lineHeight: 1.45 },
      body1: { fontSize: 17, fontWeight: 400, lineHeight: 1.5, letterSpacing: '-0.01em' },
      body2: { fontSize: 15, fontWeight: 400, lineHeight: 1.45, letterSpacing: '-0.01em' },
      caption: { fontSize: 12, fontWeight: 400, lineHeight: 1.35 },
      overline: { fontSize: 13, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0 },
      button: { textTransform: 'none', fontWeight: 600, fontSize: 15 },
    },
    shadows: buildShadows(),
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: dark ? '#000' : '#F2F2F7' },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 12,
            minHeight: 36,
            paddingInline: 16,
            transition: 'transform 150ms cubic-bezier(0.4,0,0.2,1), background-color 150ms',
            '&:active': { transform: 'scale(0.97)' },
          },
          containedPrimary: { color: '#fff' },
          outlined: { borderColor: 'transparent', backgroundColor: dark ? 'rgba(120,120,128,0.24)' : 'rgba(120,120,128,0.08)' },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { backgroundImage: 'none', border: 'none' } },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            border: 'none',
            borderRadius: 16,
            boxShadow: SHADOWS[1],
            backgroundColor: dark ? '#1C1C1E' : '#FFFFFF',
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 500, borderRadius: 8, backgroundColor: dark ? 'rgba(120,120,128,0.24)' : 'rgba(120,120,128,0.08)' },
          outlined: { borderColor: 'transparent' },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: 'inherit' },
        styleOverrides: {
          root: {
            backgroundColor: dark ? 'rgba(28,28,30,0.72)' : 'rgba(255,255,255,0.72)',
            backdropFilter: 'saturate(180%) blur(20px)',
            WebkitBackdropFilter: 'saturate(180%) blur(20px)',
            borderBottom: `1px solid ${dark ? 'rgba(84,84,88,0.65)' : 'rgba(60,60,67,0.16)'}`,
            backgroundImage: 'none',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: { paper: { border: 'none', backgroundColor: dark ? '#1C1C1E' : '#FFFFFF' } },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 22, border: 'none' },
          backdrop: { backgroundColor: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(2px)' },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: { borderRadius: 16, border: 'none', boxShadow: SHADOWS[2], minWidth: 180 },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: { borderRadius: 12, minHeight: 44 },
        },
      },
      MuiDivider: { styleOverrides: { root: { borderColor: dark ? 'rgba(84,84,88,0.65)' : 'rgba(60,60,67,0.16)' } } },
      MuiTooltip: {
        defaultProps: { arrow: true },
        styleOverrides: { tooltip: { borderRadius: 8, fontSize: 12, backgroundColor: 'rgba(60,60,67,0.92)' } },
      },
      MuiLinearProgress: {
        styleOverrides: { root: { borderRadius: 999, backgroundColor: dark ? 'rgba(120,120,128,0.24)' : 'rgba(120,120,128,0.12)' } },
      },
      MuiTableCell: { styleOverrides: { root: { borderBottomColor: dark ? 'rgba(84,84,88,0.65)' : 'rgba(60,60,67,0.16)' } } },
      MuiTextField: { defaultProps: { variant: 'filled' } },
      MuiFilledInput: {
        defaultProps: { disableUnderline: true },
        styleOverrides: {
          root: {
            borderRadius: 12,
            backgroundColor: dark ? 'rgba(120,120,128,0.24)' : 'rgba(120,120,128,0.08)',
            '&:hover': { backgroundColor: dark ? 'rgba(120,120,128,0.32)' : 'rgba(120,120,128,0.12)' },
            '&.Mui-focused': {
              backgroundColor: dark ? 'rgba(120,120,128,0.24)' : 'rgba(120,120,128,0.08)',
              boxShadow: '0 0 0 4px rgba(175,82,222,0.12)',
            },
          },
        },
      },
      MuiSelect: { defaultProps: { variant: 'filled' } },
      MuiTabs: {
        styleOverrides: {
          root: { minHeight: 36 },
          indicator: { height: 2, borderRadius: 2 },
        },
      },
      MuiTab: { styleOverrides: { root: { minHeight: 36, textTransform: 'none', fontWeight: 600, fontSize: 15 } } },
      MuiSkeleton: { styleOverrides: { root: { borderRadius: 8, backgroundColor: dark ? 'rgba(120,120,128,0.24)' : 'rgba(120,120,128,0.10)' } } },
      MuiAvatar: { styleOverrides: { root: { fontWeight: 600 } } },
    },
  });
}

export const theme = buildTheme(prefersDark());
export default theme;
