import type { IpcDefs, IpcDomainValue } from '../contract'
import { defineIpcDomain, invoke } from '../contract'

/**
 * 窗口域契约：自绘标题栏的窗口控制（注册实现在 packages/window WindowSystem）。
 * 全部按 event.sender 反查归属窗口，参数不携带窗口身份。
 */
export const windowDomain = defineIpcDomain('window', {
  minimize: invoke<() => void>(),
  toggleMaximize: invoke<() => void>(),
  isMaximized: invoke<() => boolean>(),
  restore: invoke<() => void>(),
  setAlwaysOnTop: invoke<(flag: boolean) => void>(),
  flash: invoke<(flag: boolean) => void>(),
  close: invoke<() => void>(),
  quit: invoke<() => void>(),
}) satisfies IpcDomainValue<'window', IpcDefs>
