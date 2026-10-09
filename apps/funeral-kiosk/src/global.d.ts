import type { DesktopApi } from '@desktop/shared'

declare global {
  interface Window {
    desktop: DesktopApi
  }
}

export {}
