import type { IdReaderDevice, IdReaderResult } from '@desktop/shared'
import type { IdCardSystem } from '../devices/idcard'
import { handle } from './handle'

export interface DeviceIpcDeps {
  /** 证卡读取系统（bootstrap 装配）；未装配时调用返回统一错误结果，不拒绝 */
  idCard?: IdCardSystem
}

/**
 * 设备域通道注册：外设硬件通道（读卡器 / 打印机 / 扫码枪 / 摄像头…）。
 * 硬件操作永不 reject，失败以结果对象的 error 字段回传（渲染层无需 try/catch）。
 */
export function registerDeviceIpc(deps: DeviceIpcDeps): void {
  handle('device:listReaders', () => listReaders(deps.idCard))
  handle('device:readIdCard', (_e, req) => readIdCard(deps.idCard, req))
}

/** 列出读卡器：系统未装配返回统一错误结果 */
async function listReaders(system: IdCardSystem | undefined): Promise<{ ok: true, readers: IdReaderDevice[] } | { ok: false, error: { code: string, message: string } }> {
  if (!system) {
    return { ok: false, error: { code: 'ADAPTER_UNAVAILABLE', message: '设备系统未装配（bootstrap 未配置 devices）' } }
  }
  return { ok: true, readers: await system.listReaders() }
}

/** 读证卡：deviceId 缺省时自动选用第一个就绪的读卡器；系统未装配返回统一错误结果 */
async function readIdCard(system: IdCardSystem | undefined, req?: { deviceId?: string }): Promise<IdReaderResult> {
  if (!system) {
    return { ok: false, error: { code: 'ADAPTER_UNAVAILABLE', message: '设备系统未装配（bootstrap 未配置 devices）' } }
  }
  const deviceId = req?.deviceId ?? (await system.listReaders()).find(reader => reader.status === 'ready')?.id
  if (!deviceId) {
    return { ok: false, error: { code: 'DEVICE_NOT_FOUND', message: '无可用读卡器' } }
  }
  return system.read({ deviceId })
}
