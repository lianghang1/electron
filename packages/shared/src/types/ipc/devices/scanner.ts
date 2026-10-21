import type { ScannerConfig, ScannerSetInput, ScannerStatus, ScanResult } from '../../devices/scanner'
import { invoke, push } from '../../../domain'

/**
 * scanner 域契约 —— 扫码枪（键盘仿真 / 厂商 HID 通道）。
 * 扫码结果为广播推送（Main 检测到条码后推给所有窗口），配置为请求-响应。
 * 档案清单由代码出厂预设锁死，界面仅提交白名单覆盖。
 */
export const scannerDomainDefs = {
  /** 读取当前扫码枪配置（总开关 + 激活档案 + 全量档案，只读视图） */
  getConfig: invoke<() => ScannerConfig>(),
  /** 提交域级开关/激活指向 + 单档案白名单覆盖（deviceId 必须为出厂预设项；非法入参抛 VALIDATION_FAILED），返回保存后的全量配置 */
  setConfig: invoke<(input: ScannerSetInput) => ScannerConfig>(),
  /** 模拟一条扫码（诊断/演示：走与真枪完全相同的缓冲 → 广播链路；仅 dev 环境可用，生产返回 PERMISSION_DENIED） */
  simulate: invoke<(code: string) => ScanResult>(),
  /** 扫码推送：任何窗口检测到条码都广播（缓冲命中后触发） */
  scanReceived: push<[result: ScanResult]>(),
  /** 扫码通道状态推送（HID 连接建立/断开/模式切换时广播） */
  statusUpdated: push<[status: ScannerStatus]>(),
}
