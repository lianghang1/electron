/**
 * 更新域契约：整包 + asar 热更。
 */
import type { AsarUpdateState, UpdateState } from '../update'

export type UpdateIpc = {
  /** 触发检查更新（dev 下为空操作） */
  'update:check': () => void
  /** 重启应用以生效更新：有 asar 热更 pending → 重启替换；有整包已下载 → 安装器重启 */
  'update:install': () => void

  // ---- Main → Renderer 推送 ----
  /** 更新流程状态变化 */
  'update:state': [UpdateState]
  /** asar 热更状态变化（pending = 重启应用生效） */
  'update:asarState': [AsarUpdateState]
}
