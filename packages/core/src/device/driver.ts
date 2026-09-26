import type { DeviceIdCard, DevicePrintTicket } from '@desktop/shared'

/**
 * 硬件驱动接口：设备通用层（device:*）的 SDK 适配缝。
 * 平台内置 mock 实现；对接真实设备时由 App 在 bootstrap.devices 注入实现，
 * 契约、校验、频控与业务页全部不动。
 */

/** 身份证 / 接触式读卡器驱动 */
export interface CardReaderDriver {
  /** 读卡：返回卡片信息；无卡或读卡失败返回 null（平台统一兜底语义） */
  readIdCard: () => DeviceIdCard | null | Promise<DeviceIdCard | null>
}

/** 票据打印机驱动 */
export interface PrinterDriver {
  /** 打印票据：resolve 即代表出纸完成；抛错由平台记录并透传给调用方 */
  print: (ticket: DevicePrintTicket) => void | Promise<void>
}
