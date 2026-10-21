import type { CaptureDeviceOverrides } from '@desktop/shared'
import { isWsUrl } from './ws-url'

/**
 * 设备档案现场覆盖的 IPC 入参收敛（白名单形状）。
 * 档案清单与技术字段（品牌/接入方式/协议/能力/DLL）由代码出厂预设锁死，
 * renderer 仅能提交白名单覆盖；非法值直接拒绝（VALIDATION_FAILED），不静默放宽。
 * err = 各域错误工厂（统一错误契约跨域透传）。
 */
export interface OverridesInput {
  displayName?: unknown
  ws?: { url?: unknown }
}

export interface OverridesSanitized { displayName?: string, ws?: { url?: string } }

/** 三域（idcard/signature/iccard）共用：名称 + ws 地址 */
export function sanitizeOverrides(
  input: OverridesInput | undefined,
  err: (code: 'VALIDATION_FAILED', message: string) => Error,
): OverridesSanitized {
  if (!input || typeof input !== 'object') {
    throw err('VALIDATION_FAILED', '设备配置覆盖缺失')
  }
  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : undefined
  if (displayName !== undefined && !displayName) {
    throw err('VALIDATION_FAILED', '设备名称不能为空')
  }
  const url = typeof input.ws?.url === 'string' ? input.ws.url.trim() : undefined
  if (url !== undefined && !isWsUrl(url)) {
    throw err('VALIDATION_FAILED', `服务地址不合法（须 ws:// 或 wss:// 前缀）: ${url}`)
  }
  return {
    ...(displayName ? { displayName } : {}),
    ...(url ? { ws: { url } } : {}),
  }
}

export interface CaptureOverridesInput {
  displayName?: unknown
  ws?: { url?: unknown, camId?: unknown, width?: unknown, height?: unknown, wake?: { command?: unknown } }
  service?: { baseUrl?: unknown, listPath?: unknown, capturePath?: unknown }
}

/** capture 域：名称 + ws 连接参数 + service 连接参数（协议/能力/DLL 等技术字段不在白名单） */
export function sanitizeCaptureOverrides(
  input: CaptureOverridesInput | undefined,
  err: (code: 'VALIDATION_FAILED', message: string) => Error,
): CaptureDeviceOverrides {
  if (!input || typeof input !== 'object') {
    throw err('VALIDATION_FAILED', '设备配置覆盖缺失')
  }
  const base = sanitizeOverrides(input, err)
  const ws = input.ws && typeof input.ws === 'object' ? input.ws : undefined
  const camId = typeof ws?.camId === 'number' && Number.isInteger(ws.camId) && ws.camId >= 0 ? ws.camId : undefined
  const width = typeof ws?.width === 'number' && ws.width > 0 ? ws.width : undefined
  const height = typeof ws?.height === 'number' && ws.height > 0 ? ws.height : undefined
  const wakeCommand = typeof ws?.wake?.command === 'string' ? ws.wake.command.trim() : undefined
  const service = input.service && typeof input.service === 'object' ? input.service : undefined
  const baseUrl = typeof service?.baseUrl === 'string' ? service.baseUrl.trim() : undefined
  const listPath = typeof service?.listPath === 'string' ? service.listPath.trim() : undefined
  const capturePath = typeof service?.capturePath === 'string' ? service.capturePath.trim() : undefined
  if (baseUrl !== undefined && !baseUrl) {
    throw err('VALIDATION_FAILED', '服务地址不能为空')
  }
  // wake 段显式提交即整体重设：空命令 = 清除拉起命令（回落发现式策略）
  const wakeProvided = ws !== undefined && typeof ws.wake === 'object' && ws.wake !== null
  const wsPatch = ws !== undefined && (camId !== undefined || width !== undefined || height !== undefined || wakeProvided || base.ws !== undefined)
    ? {
        ws: {
          ...(base.ws ?? {}),
          ...(camId !== undefined ? { camId } : {}),
          ...(width !== undefined ? { width } : {}),
          ...(height !== undefined ? { height } : {}),
          ...(wakeProvided ? { wake: { command: wakeCommand ?? '' } } : {}),
        },
      }
    : {}
  const servicePatch = service !== undefined && (baseUrl !== undefined || listPath !== undefined || capturePath !== undefined)
    ? {
        service: {
          ...(baseUrl !== undefined ? { baseUrl } : {}),
          ...(listPath !== undefined ? { listPath } : {}),
          ...(capturePath !== undefined ? { capturePath } : {}),
        },
      }
    : {}
  return { ...base, ...wsPatch, ...servicePatch }
}
