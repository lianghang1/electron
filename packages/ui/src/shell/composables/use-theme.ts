import { ref } from 'vue'

export type ShellTheme = 'light' | 'dark'

const THEME_KEY = 'dt-theme'

function init(): ShellTheme {
  return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
}

const theme = ref<ShellTheme>(init())

function apply(value: ShellTheme): void {
  document.documentElement.dataset.theme = value
  localStorage.setItem(THEME_KEY, value)
}

apply(theme.value)

/** Shell 双主题状态：tokens.css 按 :root[data-theme] 换肤，持久化在 localStorage */
export function useTheme() {
  function toggle(): void {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    apply(theme.value)
  }
  return { theme, toggle }
}
