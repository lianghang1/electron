import type { DesktopBridge } from './preload'

/**
 * 渲染层类型化调用端：window.desktop 的 TS 视图。
 * 域方法类型由 @shell/shared 域签名推导。
 */
declare global {
  interface Window {
    desktop: DesktopBridge
  }
}

export function desktop(): DesktopBridge {
  if (!window.desktop) { throw new Error('[bridge] desktop bridge not installed — preload missing?') }
  return window.desktop
}
