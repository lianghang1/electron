import type { ShellBridge } from '@shell/shared/ipc'

/**
 * 渲染层类型化调用端：window.desktop 的 TS 视图。
 * 桥面类型由 @shell/shared ipc 契约推导（ShellBridge），域方法签名单一真源。
 */
declare global {
  interface Window {
    desktop: ShellBridge
  }
}

export function desktop(): ShellBridge {
  if (!window.desktop) { throw new Error('[bridge] desktop bridge not installed — preload missing?') }
  return window.desktop
}
