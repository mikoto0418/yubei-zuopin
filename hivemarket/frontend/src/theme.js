// HiveMarket · Apple 设计基底 PrimeVue 主题
// 在 Aura 基础上改 token：系统色 + 圆角令牌 + 极克制的阴影 + 系统字体栈。
// 设计令牌以 apple-tokens.css 为唯一真源，这里只做 PrimeVue 侧映射。
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

// 与 apple-tokens.css 保持一致的系统色
export const HM = {
  red: '#FF3B30',
  blue: '#007AFF',
  green: '#34C759',
  orange: '#FF9500',
  yellow: '#FFCC00',
  gray: '#8E8E93',
  label: 'rgba(0,0,0,0.92)',
  labelSecondary: 'rgba(60,60,67,0.60)',
  separator: 'rgba(60,60,67,0.16)',
  bgGrouped: '#F2F2F7',
  surface: '#FFFFFF',
};

// Apple 字体栈（与 --font-sans 同源）
export const FONT_SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", system-ui, sans-serif';

export const HivePreset = definePreset(Aura, {
  semantic: {
    fontFamily: FONT_SANS,
    primary: {
      50: '#eaf3ff',
      100: '#d6e8ff',
      200: '#aed0ff',
      300: '#7db4ff',
      400: '#4a95ff',
      500: '#007AFF',
      600: '#0062cc',
      700: '#004c9e',
      800: '#003a78',
      900: '#002a57',
      950: '#001a36',
    },
    colorScheme: {
      light: {
        primary: {
          color: '#007AFF',
          contrastColor: '#ffffff',
          hoverColor: '#0069db',
          activeColor: '#0059b8',
        },
        highlight: {
          background: 'rgba(0,122,255,0.12)',
          focusBackground: 'rgba(0,122,255,0.16)',
          color: '#007AFF',
          focusColor: '#007AFF',
        },
        surface: {
          0: '#ffffff',
          50: '#F9F9FB',
          100: '#F2F2F7',
          200: '#E5E5EA',
          300: '#D1D1D6',
          400: '#C7C7CC',
          500: '#AEAEB2',
          600: '#8E8E93',
          700: '#636366',
          800: '#3A3A3C',
          900: '#1C1C1E',
          950: '#0D0D0F',
        },
      },
      dark: {
        primary: {
          color: '#0A84FF',
          contrastColor: '#ffffff',
          hoverColor: '#3D9BFF',
          activeColor: '#66B2FF',
        },
        highlight: {
          background: 'rgba(10,132,255,0.24)',
          focusBackground: 'rgba(10,132,255,0.32)',
          color: '#0A84FF',
          focusColor: '#0A84FF',
        },
        surface: {
          0: '#1C1C1E',
          50: '#2C2C2E',
          100: '#2C2C2E',
          200: '#3A3A3C',
          300: '#48484A',
          400: '#636366',
          500: '#8E8E93',
          600: '#AEAEB2',
          700: '#C7C7CC',
          800: '#D1D1D6',
          900: '#E5E5EA',
          950: '#F2F2F7',
        },
      },
    },
    formField: {
      paddingX: '0.75rem',
      paddingY: '0.55rem',
      borderRadius: '12px',
      focusRing: {
        width: '4px',
        style: 'solid',
        color: 'rgba(0,122,255,0.12)',
        offset: '0px',
      },
    },
    focusRing: {
      width: '4px',
      style: 'solid',
      color: 'rgba(0,122,255,0.12)',
      offset: '0px',
    },
    borderRadius: {
      none: '0',
      xs: '6px',
      sm: '8px',
      md: '12px',
      lg: '16px',
      xl: '22px',
    },
  },
  components: {
    button: {
      root: {
        borderRadius: '12px',
        paddingX: '1rem',
        paddingY: '0.55rem',
        label: { fontWeight: '600' },
      },
      colorScheme: {
        light: {
          root: {
            primary: {
              background: '#007AFF',
              borderColor: '#007AFF',
              color: '#ffffff',
              hoverBackground: '#0069db',
              hoverBorderColor: '#0069db',
              hoverColor: '#ffffff',
              activeBackground: '#0059b8',
              activeBorderColor: '#0059b8',
            },
            secondary: {
              background: 'rgba(120,120,128,0.12)',
              borderColor: 'transparent',
              color: '#007AFF',
              hoverBackground: 'rgba(120,120,128,0.18)',
              hoverBorderColor: 'transparent',
              hoverColor: '#007AFF',
            },
          },
        },
      },
    },
    card: {
      root: {
        background: '#ffffff',
        borderRadius: '16px',
        shadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
      },
      body: { padding: '1.1rem' },
    },
    datatable: {
      root: { borderRadius: '16px' },
      header: { background: '#F9F9FB', borderColor: 'rgba(60,60,67,0.16)', borderWidth: '0 0 1px 0' },
      headerCell: {
        background: 'transparent',
        color: 'rgba(60,60,67,0.60)',
        borderColor: 'rgba(60,60,67,0.16)',
        borderWidth: '0 0 1px 0',
        padding: '0.7rem 0.9rem',
        fontWeight: '600',
      },
      bodyCell: {
        borderColor: 'rgba(60,60,67,0.16)',
        borderWidth: '0 0 1px 0',
        padding: '0.7rem 0.9rem',
      },
      footer: { background: 'transparent', borderColor: 'rgba(60,60,67,0.16)', borderWidth: '1px 0 0 0' },
    },
    dialog: {
      root: { borderRadius: '22px', borderWidth: '0', borderColor: 'transparent' },
      header: { padding: '1.1rem 1.2rem', borderColor: 'transparent' },
      content: { padding: '0 1.2rem 1.2rem' },
      title: { fontWeight: '600' },
    },
    tag: {
      root: { borderRadius: '8px', fontWeight: '600', fontSize: '0.78rem', padding: '0.15rem 0.5rem' },
    },
    select: { root: { borderRadius: '12px' } },
    inputtext: { root: { borderRadius: '12px' } },
    textarea: { root: { borderRadius: '12px' } },
    inputnumber: { root: { borderRadius: '12px' } },
    paginator: {
      root: { borderRadius: '12px', borderColor: 'rgba(60,60,67,0.16)', borderWidth: '1px', background: '#ffffff' },
      navButton: { borderRadius: '8px' },
    },
    toast: { root: { borderRadius: '16px', borderWidth: '0', borderColor: 'transparent' } },
    confirmdialog: { root: { borderRadius: '22px', borderWidth: '0', borderColor: 'transparent' } },
    steps: { item: { number: { fontWeight: '600' } } },
    badge: { root: { borderRadius: '999px', fontWeight: '600' } },
    avatar: { root: { borderRadius: '999px', fontWeight: '600' } },
    message: { root: { borderRadius: '12px', borderWidth: '0', borderColor: 'transparent' } },
    progressbar: { root: { borderRadius: '999px' } },
    skeleton: { root: { borderRadius: '8px' } },
  },
});

// 兼容旧引用（不再使用硬阴影）
export const HARD_SHADOW = 'none';
export const HARD_SHADOW_SM = 'none';

export default HivePreset;
