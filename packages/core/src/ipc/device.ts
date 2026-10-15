import type { IcCardReadRequest, IcCardReadResult, IcCardTextsWriteRequest, IcCardWriteRequest, IdCardData } from '@desktop/shared'
import type { IdCardSystem } from '../devices/idcard'
import { idCardError } from '../devices/idcard/errors'
import { handle } from './handle'

export interface DeviceIpcDeps {
  /** 证卡读取系统（bootstrap 装配）；未装配时调用以 ADAPTER_UNAVAILABLE 拒绝 */
  idCard?: IdCardSystem
}

/**
 * 设备域通道注册：外设硬件通道（读卡器 / 打印机 / 扫码枪 / 摄像头…）。
 * 异常契约：失败 reject（IpcRemoteError），主进程日志由 createHandle 统一留痕，
 * 渲染层按错误码（IdReaderErrorCode）分支。
 */
export function registerDeviceIpc(deps: DeviceIpcDeps): void {
  handle('device:listReaders', () => requireSystem(deps.idCard).listReaders())
  handle('device:readIdCard', (_e, req) => readIdCard(deps.idCard, req))
  handle('device:readIcCard', (_e, req) => readIcCard(deps.idCard, req))
  handle('device:writeIcCard', (_e, req) => writeIcCard(deps.idCard, req))
  handle('device:writeIcCardTexts', (_e, req) => writeIcCardTexts(deps.idCard, req))
}

/** 系统未装配即拒绝（bootstrap 未配置 devices 属配置错误，渲染层按码提示） */
function requireSystem(system: IdCardSystem | undefined): IdCardSystem {
  if (!system) {
    throw idCardError('ADAPTER_UNAVAILABLE', '设备系统未装配（bootstrap 未配置 devices）')
  }
  return system
}

/** 读卡器定位：deviceId 缺省时自动选用第一个具备指定能力且就绪的读卡器 */
async function pickReader(idCard: IdCardSystem, req: { deviceId?: string } | undefined, capability: string, notFound: string): Promise<string> {
  if (req?.deviceId) {
    return req.deviceId
  }
  const found = (await idCard.listReaders()).find(reader => reader.status === 'ready' && reader.capabilities.includes(capability))
  if (!found) {
    throw idCardError('DEVICE_NOT_FOUND', notFound)
  }
  return found.id
}

/** 读身份证：deviceId 缺省时自动选用第一个支持身份证且就绪的读卡器 */
async function readIdCard(system: IdCardSystem | undefined, req?: { deviceId?: string }): Promise<IdCardData> {
  const idCard = requireSystem(system)
  const deviceId = await pickReader(idCard, req, 'idcard', '无可用读卡器')
  return idCard.read({ deviceId })
}

/** 读 IC 卡一个扇区（返回原始块数据 + 字符串组 texts）：deviceId 缺省时自动选用第一个支持 IC 卡且就绪的读卡器 */
async function readIcCard(system: IdCardSystem | undefined, req?: IcCardReadRequest & { deviceId?: string }): Promise<IcCardReadResult> {
  const idCard = requireSystem(system)
  const deviceId = await pickReader(idCard, req, 'iccard', '无可用 IC 卡读卡器')
  return idCard.readIc({ deviceId, key: req?.key, keyType: req?.keyType, sector: req?.sector })
}

/** 写 IC 卡块：deviceId 缺省时自动选用第一个支持写卡且就绪的读卡器；危险块由驱动强制拒绝 */
async function writeIcCard(system: IdCardSystem | undefined, req?: IcCardWriteRequest & { deviceId?: string }): Promise<void> {
  const idCard = requireSystem(system)
  const deviceId = await pickReader(idCard, req, 'iccard-write', '无支持写卡的 IC 卡读卡器')
  if (!req) {
    throw idCardError('VALIDATION_FAILED', '缺少写入参数')
  }
  await idCard.writeIc({ deviceId, block: req.block, data: req.data, key: req.key, keyType: req.keyType })
}

/** 写 IC 卡扇区字符串组：deviceId 缺省时自动选用第一个支持写卡且就绪的读卡器；约束校验在系统层 */
async function writeIcCardTexts(system: IdCardSystem | undefined, req?: IcCardTextsWriteRequest & { deviceId?: string }): Promise<void> {
  const idCard = requireSystem(system)
  const deviceId = await pickReader(idCard, req, 'iccard-write', '无支持写卡的 IC 卡读卡器')
  if (!req) {
    throw idCardError('VALIDATION_FAILED', '缺少写入参数')
  }
  await idCard.writeIcTexts({ deviceId, sector: req.sector, texts: req.texts, key: req.key, keyType: req.keyType })
}
