import type { ShellBridge } from '@shell/shared/ipc'

/**
 * 渲染层类型化调用端：window.shell 的 TS 视图。
 * 桥面类型由 @shell/shared ipc 契约推导（ShellBridge），域方法签名单一真源。
 */
declare global {
  interface Window {
    shell: ShellBridge
  }
}

export function shell(): ShellBridge {
  if (!window.shell) { throw new Error('[bridge] shell bridge not installed — preload missing?') }
  return window.shell
}
