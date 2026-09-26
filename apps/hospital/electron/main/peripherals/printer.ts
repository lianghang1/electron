import type { DevicePrintTicket } from '@desktop/shared'
import { handle } from '@desktop/core'

/**
 * 票据打印服务（mock）。
 *
 * 真实接入位：替换 printTicket 为厂商 SDK 调用——
 * - 64 位 Node binding：直接 require 后同步/异步调用
 * - 仅有 32 位 DLL 的型号：child_process 拉起厂商独立打印程序（或自写代理进程）
 * 契约（device:printer:print）与注册代码不变，业务页无感。
 */
export function registerPrinter(): void {
  handle('device:printer:print', (_event, ticket) => printTicket(ticket))
}

/** mock：模拟打印耗时（约一张热敏票据的出纸时间），返回即代表出纸完成 */
function printTicket(ticket: DevicePrintTicket): Promise<void> {
  const copies = ticket.copies ?? 1
  return new Promise((resolve) => {
    setTimeout(resolve, copies * 800)
  })
}
