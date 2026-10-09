import type { ConfigProviderThemeVars } from '@wot-ui/ui'

type PrimaryShadeKey
  = | 'primary1'
    | 'primary2'
    | 'primary3'
    | 'primary4'
    | 'primary5'
    | 'primary6'
    | 'primary7'
    | 'primary8'
    | 'primary9'
    | 'primary10'

type ThemePrimaryShades = Record<PrimaryShadeKey, string>

export interface ThemeColorOption {
  name: string
  value: string
  primary: string
  primaryShades?: ThemePrimaryShades
}

export interface ThemeState {
  theme: string
  hasUserSet: boolean
  wotThemeVars: ConfigProviderThemeVars
  themeVars: Record<string, string>
}

export const themeColorOptions: ThemeColorOption[] = [
  {
    name: '雅致蓝',
    value: 'blue',
    primary: '#4A6F8A',
    primaryShades: {
      primary1: '#F5F8FA',
      primary2: '#EAF0F4',
      primary3: '#DCE6EC',
      primary4: '#C4D3DD',
      primary5: '#9FB5C3',
      primary6: '#4A6F8A',
      primary7: '#405F76',
      primary8: '#354F63',
      primary9: '#2B4151',
      primary10: '#21333F',
    },
  },
]
