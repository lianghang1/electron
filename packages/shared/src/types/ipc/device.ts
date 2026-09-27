/**
 * 设备域契约（读卡器/打印机等硬件，各 App 复用）。
 * handler 由 core 的 DeviceService 注册（不走 ipc/ 编排），Driver 可经 bootstrap.devices 注入。
 */
import type { DeviceIdCard, DevicePrintTicket } from '../device'

export type DeviceIpc = {
  'device:idcard:read': () => DeviceIdCard | null
  'device:printer:print': (ticket: DevicePrintTicket) => void
}
