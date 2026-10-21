import type { IcCardReadRequest, IcCardReadResult, IcCardTextsWriteRequest, IcCardWriteRequest } from '@desktop/shared'
import type { IcCardSystem } from '../devices/iccard'
import { icCardError } from '../devices/iccard/errors'
import { sanitizeOverrides } from './device-profile'
import { handle } from './handle'

export interface IccardIpcDeps {
  /** IC 卡读写系统（bootstrap 装配）；未装配时调用以 ADAPTER_UNAVAILABLE 拒绝 */
  iccard?: IcCardSystem
}

/**
 * iccard 域通道注册：M1 IC 卡读写。
 * 异常契约：失败 reject（IpcRemoteError），主进程日志由 createHandle 统一留痕，
 * 渲染层按错误码（IcCardErrorCode）分支。
 */
export function registerIccardIpc(deps: IccardIpcDeps): void {
  handle('iccard:listReaders', () => requireSystem(deps.iccard).listReaders())
  handle('iccard:readIcCard', (_e, req) => readIcCard(deps.iccard, req))
  handle('iccard:writeIcCard', (_e, req) => writeIcCard(deps.iccard, req))
  handle('iccard:writeIcCardTexts', (_e, req) => writeIcCardTexts(deps.iccard, req))
  // 档案制配置管理：按档案 id 提交白名单覆盖（ws 路线协议未接入，档案先行管理）
  handle('iccard:getConfig', () => requireSystem(deps.iccard).getConfig())
  handle('iccard:setConfig', (_e, id, overrides) => requireSystem(deps.iccard).setConfig(String(id), sanitizeOverrides(overrides, icCardError)))
}

/** 系统未装配即拒绝（bootstrap 未配置 devices 属配置错误，渲染层按码提示） */
function requireSystem(system: IcCardSystem | undefined): IcCardSystem {
  if (!system) {
    throw icCardError('ADAPTER_UNAVAILABLE', '设备系统未装配（bootstrap 未配置 devices）')
  }
  return system
}

/** 读卡器定位：deviceId 缺省时自动选用域内第一个就绪（写路径另需支持写卡）的读卡器 */
async function pickReader(system: IcCardSystem, req: { deviceId?: string } | undefined, notFound: string, capability?: string): Promise<string> {
  if (req?.deviceId) {
    return req.deviceId
  }
  const found = (await system.listReaders()).find(reader =>
    reader.status === 'ready' && (capability === undefined || reader.capabilities.includes(capability)))
  if (!found) {
    throw icCardError('DEVICE_NOT_FOUND', notFound)
  }
  return found.id
}

/** 读 IC 卡一个扇区（返回原始块数据 + 字符串组 texts）：deviceId 缺省时自动选用第一个就绪的读卡器 */
async function readIcCard(system: IcCardSystem | undefined, req?: IcCardReadRequest & { deviceId?: string }): Promise<IcCardReadResult> {
  const iccard = requireSystem(system)
  const deviceId = await pickReader(iccard, req, '无可用 IC 卡读卡器')
  return iccard.readIc({ deviceId, key: req?.key, keyType: req?.keyType, sector: req?.sector })
}

/** 写 IC 卡块：deviceId 缺省时自动选用第一个支持写卡且就绪的读卡器；危险块由驱动强制拒绝 */
async function writeIcCard(system: IcCardSystem | undefined, req?: IcCardWriteRequest & { deviceId?: string }): Promise<void> {
  const iccard = requireSystem(system)
  const deviceId = await pickReader(iccard, req, '无支持写卡的 IC 卡读卡器', 'iccard-write')
  if (!req) {
    throw icCardError('VALIDATION_FAILED', '缺少写入参数')
  }
  await iccard.writeIc({ deviceId, block: req.block, data: req.data, key: req.key, keyType: req.keyType })
}

/** 写 IC 卡扇区字符串组：deviceId 缺省时自动选用第一个支持写卡且就绪的读卡器；约束校验在系统层 */
async function writeIcCardTexts(system: IcCardSystem | undefined, req?: IcCardTextsWriteRequest & { deviceId?: string }): Promise<void> {
  const iccard = requireSystem(system)
  const deviceId = await pickReader(iccard, req, '无支持写卡的 IC 卡读卡器', 'iccard-write')
  if (!req) {
    throw icCardError('VALIDATION_FAILED', '缺少写入参数')
  }
  await iccard.writeIcTexts({ deviceId, sector: req.sector, texts: req.texts, key: req.key, keyType: req.keyType })
}
