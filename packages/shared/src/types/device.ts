/**
 * 通用外设通道类型（device:*，各 Kiosk App 复用）。
 * handler 在 app 侧实现（厂商 SDK / mock），契约在此统一声明。
 */

/** 身份证 / 就诊卡读卡结果（mock 与真实 SDK 共用形态） */
export interface DeviceIdCard {
  name: string
  idNumber: string
  gender: '男' | '女'
  birthDate: string
}

/** 票据打印任务 */
export interface DevicePrintTicket {
  title: string
  /** 逐行文本（小票排版由打印服务负责） */
  lines: string[]
  /** 打印份数，默认 1 */
  copies?: number
}
