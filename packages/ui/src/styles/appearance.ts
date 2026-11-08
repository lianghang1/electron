import type { ThemePreference } from '@shell/shared'

/**
 * 外观运行时：flavor 主色 + 用户主题偏好落到 :root。
 * 与 tokens.css 的分工——tokens 定义静态令牌与派生规则（color-mix），
 * 本模块只覆写两个输入变量（--dt-accent / data-theme），派生量自动跟随。
 */

let systemListener: ((e: MediaQueryListEvent) => void) | undefined
let current: ThemePreference = 'system'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function resolve(pref: ThemePreference): 'light' | 'dark' {
  return pref === 'system'
    ? (window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light')
    : pref
}

/** 注入 flavor 主色：soft / hover / ring 由 tokens.css 的 color-mix 自动派生 */
export function applyAccent(accent: string): void {
  document.documentElement.style.setProperty('--dt-accent', accent)
}

/** 应用主题：system 时跟随系统变化；重复调用不叠加监听 */
export function applyTheme(pref: ThemePreference): void {
  current = pref
  const mq = window.matchMedia(DARK_QUERY)
  if (systemListener) {
    mq.removeEventListener('change', systemListener)
    systemListener = undefined
  }
  if (pref === 'system') {
    systemListener = () => paint(resolve('system'))
    mq.addEventListener('change', systemListener)
  }
  paint(resolve(pref))
}

function paint(resolved: 'light' | 'dark'): void {
  if (resolved === 'dark') { document.documentElement.dataset.theme = 'dark' }
  else { document.documentElement.removeAttribute('data-theme') }
}

/** 挂载前一次性 bootstrap（同步，无 IPC） */
export function bootstrapAppearance(accent: string, theme: ThemePreference): void {
  applyAccent(accent)
  applyTheme(theme)
}

export function currentTheme(): ThemePreference {
  return current
}
