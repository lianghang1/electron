import type { DesktopApi } from '@desktop/shared'

/** 包内组件运行在 Electron 渲染层（宿主 App 的 preload 已 exposeDesktop） */
declare global {
  interface Window {
    desktop: DesktopApi
  }
}

export {}
