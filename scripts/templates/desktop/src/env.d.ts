/// <reference types="vite/client" />
import type { DesktopApi } from '@desktop/shared'

declare global {
  interface Window {
    desktop: DesktopApi
  }
}
