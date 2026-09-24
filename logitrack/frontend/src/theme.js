import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react'

// LogiTrack 视觉基调：Apple 基底 + 主题色 --blue，圆角/字体/阴影全部压到 Apple 令牌。
// 差异化维度（时间轴 + 地图联动）由组件层实现，主题层只负责统一基底。
const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        // 主题色：Apple System Blue 及其软色调
        brand: {
          50: { value: '#E8F2FF' },
          100: { value: '#CCE4FF' },
          200: { value: '#99C9FF' },
          300: { value: '#66ADFF' },
          400: { value: '#3392FF' },
          500: { value: '#007AFF' },
          600: { value: '#0062CC' },
          700: { value: '#004999' },
          800: { value: '#003166' },
          900: { value: '#001833' },
        },
        // 状态语义色：取 Apple 系统色，与前端 constants 保持一致
        st: {
          created: { value: '#8E8E93' },
          picked_up: { value: '#5AC8FA' },
          in_transit: { value: '#007AFF' },
          arrived_hub: { value: '#5856D6' },
          out_for_delivery: { value: '#FF9500' },
          delivered: { value: '#34C759' },
          exception: { value: '#FF3B30' },
          returned: { value: '#AF52DE' },
        },
      },
      fonts: {
        heading: { value: "var(--font-sans)" },
        body: { value: "var(--font-sans)" },
        mono: { value: "var(--font-mono)" },
      },
      radii: {
        sm: { value: '8px' },
        md: { value: '12px' },
        lg: { value: '16px' },
        xl: { value: '22px' },
        full: { value: '999px' },
      },
      shadows: {
        card: { value: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)' },
        float: { value: '0 4px 16px rgba(0,0,0,0.08), 0 12px 32px rgba(0,0,0,0.08)' },
      },
    },
    semanticTokens: {
      colors: {
        // 页面底色 / 卡片底色 绑定到 Apple 中性阶变量
        pageBg: { value: 'var(--bg-grouped)' },
        cardBg: { value: 'var(--bg-surface)' },
        label: { value: 'var(--label)' },
        labelSecondary: { value: 'var(--label-secondary)' },
        labelTertiary: { value: 'var(--label-tertiary)' },
        sep: { value: 'var(--separator)' },
        fill: { value: 'var(--fill-secondary)' },
        tint: { value: 'var(--tint)' },
        // Chakra 组件默认色板指向主题色
        brand: {
          solid: { value: '{colors.brand.500}' },
          contrast: { value: '#FFFFFF' },
          fg: { value: '{colors.brand.700}' },
          muted: { value: '{colors.brand.100}' },
          subtle: { value: '{colors.brand.200}' },
          emphasized: { value: '{colors.brand.300}' },
          focusRing: { value: '{colors.brand.500}' },
        },
      },
    },
  },
  globalCss: {
    'html, body': {
      background: 'var(--bg-grouped)',
      color: 'var(--label)',
      fontFamily: 'var(--font-sans)',
    },
  },
})

export const system = createSystem(defaultConfig, config)
export { defaultConfig }
