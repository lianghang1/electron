import type { IdcardConfig, IdCardData } from '@desktop/shared'
import type { IdCardSystem } from '../devices/idcard'
import { idCardError } from '../devices/idcard/errors'
import { handle } from './handle'
import { isWsUrl } from './ws-url'

export interface IdcardIpcDeps {
  /** 身份证阅读系统（bootstrap 装配）；未装配时调用以 ADAPTER_UNAVAILABLE 拒绝 */
  idcard?: IdCardSystem
}

/**
 * idcard 域通道注册：身份证阅读。
 * 异常契约：失败 reject（IpcRemoteError），主进程日志由 createHandle 统一留痕，
 * 渲染层按错误码（IdReaderErrorCode）分支。
 */
export function registerIdcardIpc(deps: IdcardIpcDeps): void {
  handle('idcard:listReaders', () => requireSystem(deps.idcard).listReaders())
  handle('idcard:readIdCard', (_e, req) => readIdCard(deps.idcard, req))
  handle('idcard:getConfig', () => requireSystem(deps.idcard).getConfig())
  handle('idcard:patchConfig', (_e, patch) => requireSystem(deps.idcard).setConfig(sanitizeConfig(patch)))
}

/** 配置补丁入参收敛：ws 服务地址仅接受 ws://|wss:// 前缀，非法值丢弃（不污染持久化 store） */
function sanitizeConfig(patch: Partial<IdcardConfig> | undefined): Partial<IdcardConfig> {
  const out: Partial<IdcardConfig> = {}
  if (isWsUrl(patch?.wsUrl)) {
    out.wsUrl = patch.wsUrl.trim()
  }
  return out
}

/** 系统未装配即拒绝（bootstrap 未配置 devices 属配置错误，渲染层按码提示） */
function requireSystem(system: IdCardSystem | undefined): IdCardSystem {
  if (!system) {
    throw idCardError('ADAPTER_UNAVAILABLE', '设备系统未装配（bootstrap 未配置 devices）')
  }
  return system
}

/** 读卡器定位：deviceId 缺省时自动选用域内第一个就绪的读卡器（域枚举已按能力过滤） */
async function pickReader(system: IdCardSystem, req: { deviceId?: string } | undefined, notFound: string): Promise<string> {
  if (req?.deviceId) {
    return req.deviceId
  }
  const found = (await system.listReaders()).find(reader => reader.status === 'ready')
  if (!found) {
    throw idCardError('DEVICE_NOT_FOUND', notFound)
  }
  return found.id
}

/** 读身份证：deviceId 缺省时自动选用第一个就绪的阅读器 */
async function readIdCard(system: IdCardSystem | undefined, req?: { deviceId?: string }): Promise<IdCardData> {
  const idcard = requireSystem(system)
  const deviceId = await pickReader(idcard, req, '无可用身份证阅读器')
  return idcard.read({ deviceId })
}
