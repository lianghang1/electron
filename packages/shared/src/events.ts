/**
 * 平台事件名（过去式，结果导向）。
 * 事件总线是类型化的：emit/on 的事件名必须是本表的 key。
 */
export interface PlatformEvents {
  // 应用生命周期
  'app.opening': { appId: string, instanceId: string }
  'app.opened': { appId: string, instanceId: string }
  'app.closed': { appId: string, instanceId: string, reason: 'user' | 'crash' | 'update' }
  // 设备守护进程
  'device-host.started': { pid: number }
  'device-host.exited': { pid: number, code: number, restartCount: number }
  // 更新
  'update.checked': { channel: string, available: boolean }
  'update.applied': { channel: string, version: string }
  'update.failed': { channel: string, reason: string }
  'update.restart-required': { channel: string, version: string }
  // 窗口
  'window.created': { profile: string, id: number }
  'window.closed': { id: number }
  // 设备数据流（gateway 适配层把回调转为广播）
  'scanner.scanned': { code: string }
  'signature.stroke': { point: unknown }
  'capture.frame': { deviceId: string, frame: unknown }
  // 崩溃与自愈
  'crash.renderer-gone': { windowId: number, reason: string, restartCount: number }
  'watchdog.recovery-mode': { reason: string }
}

export type PlatformEventName = keyof PlatformEvents
