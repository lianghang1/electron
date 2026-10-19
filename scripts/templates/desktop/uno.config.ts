import { defineConfig, presetWind3 } from 'unocss'

/**
 * @@PRODUCT_NAME@@ · UnoCSS 预设。
 * 色板全部映射到 Shell 令牌（dt-*，packages/ui/src/shell/styles/tokens.css），
 * 工具类随 Shell 主题自动换肤：用法如 bg-dt-surface / text-dt-text-2 / border-dt-line / bg-dt-brand。
 */
export default defineConfig({
  presets: [presetWind3()],
  // Shell 组件下沉在 packages/ui（workspace 源码引用，不在本 app root 内），
  // 默认管线扫不到，必须显式纳入，否则 Shell 的 Uno 工具类整块丢失
  content: {
    pipeline: {
      include: [
        /\.(vue|ts|tsx)($|\?)/,
        '../../packages/ui/src/**/*.{vue,ts}',
      ],
    },
  },
  theme: {
    colors: {
      dt: {
        'bg': 'var(--dt-bg)',
        'surface': 'var(--dt-surface)',
        'surface-2': 'var(--dt-surface-2)',
        'hover': 'var(--dt-hover)',
        'line': 'var(--dt-line)',
        'line-soft': 'var(--dt-line-soft)',
        'text': 'var(--dt-text)',
        'text-2': 'var(--dt-text-2)',
        'text-3': 'var(--dt-text-3)',
        'brand': 'var(--dt-brand)',
        'brand-hover': 'var(--dt-brand-hover)',
        'brand-soft': 'var(--dt-brand-soft)',
        'brand-text': 'var(--dt-brand-text)',
        'brand-on': 'var(--dt-brand-on)',
        'success': 'var(--dt-success)',
        'warning': 'var(--dt-warning)',
        'danger': 'var(--dt-danger)',
        'danger-soft': 'var(--dt-danger-soft)',
        'danger-text': 'var(--dt-danger-text)',
      },
    },
  },
})
