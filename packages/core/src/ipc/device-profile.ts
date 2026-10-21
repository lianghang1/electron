import { isWsUrl } from './ws-url'

/**
 * 设备档案的 IPC 入参收敛（idcard/signature/iccard 三域同构复用，ws/dll 双路线）。
 * 档案制下保存是整条 upsert：必填字段缺失直接拒绝（VALIDATION_FAILED），
 * 不静默丢字段——避免落库残缺档案。err = 各域错误工厂（统一错误契约跨域透传）。
 * dll 路线：dll 参数当前由守护进程驱动注册表自动探测消费，此处仅收编字符串形态。
 */
export interface ProfileInput {
  id?: unknown
  displayName?: unknown
  brand?: unknown
  transport?: unknown
  ws?: { url?: unknown }
  dll?: { file?: unknown }
}

export type ProfileSanitized
  = | { id: string, displayName: string, brand: string, transport: 'ws', ws: { url: string } }
    | { id: string, displayName: string, brand: string, transport: 'dll', dll: { file: string } }

export function sanitizeProfile(
  input: ProfileInput | undefined,
  err: (code: 'VALIDATION_FAILED', message: string) => Error,
): ProfileSanitized {
  const id = typeof input?.id === 'string' ? input.id.trim() : ''
  if (!id) {
    throw err('VALIDATION_FAILED', '设备档案缺少 id')
  }
  const displayName = typeof input?.displayName === 'string' ? input.displayName.trim() : ''
  if (!displayName) {
    throw err('VALIDATION_FAILED', '设备名称不能为空')
  }
  const brand = typeof input?.brand === 'string' && input.brand.trim() ? input.brand.trim() : '通用'
  if (input?.transport === 'dll') {
    return {
      id,
      displayName,
      brand,
      transport: 'dll',
      dll: { file: typeof input.dll?.file === 'string' ? input.dll.file.trim() : '' },
    }
  }
  if (input?.transport !== 'ws') {
    throw err('VALIDATION_FAILED', `不支持的接入方式: ${String(input?.transport)}`)
  }
  const url = typeof input?.ws?.url === 'string' ? input.ws.url.trim() : ''
  if (!isWsUrl(url)) {
    throw err('VALIDATION_FAILED', `服务地址不合法（须 ws:// 或 wss:// 前缀）: ${url}`)
  }
  return {
    id,
    displayName,
    brand,
    transport: 'ws',
    ws: { url },
  }
}
