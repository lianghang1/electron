import type { ThemeColorOption, ThemeState } from './types'

import { defineStore } from 'pinia'
import { themeColorOptions } from './types'

function kebabCase(str: string): string {
  str = str.replace(str.charAt(0), str.charAt(0).toLocaleLowerCase())
  return str
    .replace(/([a-z])([A-Z])/g, (_, p1, p2) => `${p1}-${p2.toLowerCase()}`)
    .replace(/([a-z])(\d)/gi, '$1-$2')
    .replace(/(\d)([a-z])/gi, '$1-$2')
}

function getThemeColorOption(theme: string): ThemeColorOption | undefined {
  return themeColorOptions.find(item => item.value === theme)
}

const DEFAULT_THEME_COLOR_OPTION: ThemeColorOption = {
  ...themeColorOptions[0],
}

export const useThemeStore = defineStore('theme-store', {
  state: (): ThemeState => ({
    theme: DEFAULT_THEME_COLOR_OPTION.value,
    hasUserSet: false,
    wotThemeVars: {
      ...DEFAULT_THEME_COLOR_OPTION.primaryShades,
    },
    themeVars: {},
  }),
  getters: {
    currentThemeOption(state) {
      return getThemeColorOption(state.theme)
    },
  },
  actions: {
    setThemeVarsToCSSVars() {
      const themeVars = (this.wotThemeVars || {}) as Record<string, string>
      if (!themeVars) {
        return
      }
      const cssVars: Record<string, string> = {}
      Object.keys(themeVars).forEach((key) => {
        cssVars[`--x-${kebabCase(key)}`] = themeVars[key]
      })
      if (this.currentThemeOption?.primary) {
        cssVars['--x-primary'] = this.currentThemeOption.primary
      }
      this.themeVars = cssVars
    },
    applyTheme(theme: string) {
      const themeOption = getThemeColorOption(theme)
      if (!themeOption) {
        return
      }
      this.theme = theme
      this.wotThemeVars = {
        ...this.currentThemeOption?.primaryShades,
      }
      this.setThemeVarsToCSSVars()
    },
    toggleTheme(theme: string) {
      this.hasUserSet = true
      this.applyTheme(theme)
    },
    initTheme() {
      if (this.hasUserSet) {
        this.applyTheme(this.theme)
        return
      }

      this.applyTheme(DEFAULT_THEME_COLOR_OPTION.value)
    },
  },
})
