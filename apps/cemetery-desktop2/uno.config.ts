import presetRemToPx from '@unocss/preset-rem-to-px'
import {
  defineConfig,
  presetIcons,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

export default defineConfig({
  presets: [
    presetIcons({
      scale: 1.2,
      warn: true,
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
      },
    }),
    // baseFontSize 16 = 标准 Tailwind/UnoCSS 刻度（1rem=16px），与参考项目一致
    presetRemToPx({ baseFontSize: 16 }),
    presetWind3(),
  ],
  shortcuts: [
    ['border-s', 'border border-solid'],
    ['wh-full', 'w-full h-full'],
    ['f-c-c', 'flex justify-center items-center'],
    ['f-col-c', 'flex-col justify-center items-center'],
    ['flex-items', 'flex items-center'],
    ['flex-justify', 'flex justify-center'],
    ['flex-col', 'flex flex-col'],
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  rules: [
    [
      'p-safe',
      {
        padding:
          'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
      },
    ],
    ['pt-safe', { 'padding-top': 'env(safe-area-inset-top)' }],
    ['pb-safe', { 'padding-bottom': 'env(safe-area-inset-bottom)' }],
    // backdrop-blur 刻度（preset-mini 未内置，参考项目依赖 frosted-glass 效果）
    [
      /^backdrop-blur(?:-(sm|md|lg|xl|2xl|3xl))?$/,
      (m) => {
        const map = { 'sm': '4px', 'md': '12px', 'lg': '16px', 'xl': '24px', '2xl': '40px', '3xl': '64px' }
        const v = m[1] ? map[m[1] as keyof typeof map] : '8px'
        return { 'backdrop-filter': `blur(${v})` }
      },
    ],
  ],
  theme: {
    colors: {
      primary: 'var(--v-color-primary)',
      success: 'var(--v-color-success)',
    },
  },
})
