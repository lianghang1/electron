import type { DesktopApi } from '@desktop/shared'

declare global {
  interface Window {
    desktop: DesktopApi
  }

  /**
   * API 基础请求地址
   */
  export const __VITE_API_BASE_URL__: string

  /**
   * 应用版本
   */
  export const __VITE_APP_VERSION__: string
}

export {}
