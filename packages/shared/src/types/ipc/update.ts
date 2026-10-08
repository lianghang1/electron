import type { AsarUpdateState, UpdateState } from '../update'
import { defineDomain, invoke, push } from '../../domain'

/**
 * 更新域契约：整包 + asar 热更。
 */
export const updateDomain = defineDomain('update', {
  /** 触发检查更新（dev 下为空操作） */
  check: invoke<() => void>(),
  /** 重启应用以生效更新：有 asar 热更 pending → 重启替换；有整包已下载 → 安装器重启 */
  install: invoke<() => void>(),

  // ---- Main → Renderer 推送 ----
  /** 更新流程状态变化 */
  state: push<[UpdateState]>(),
  /** asar 热更状态变化（pending = 重启应用生效） */
  asarState: push<[AsarUpdateState]>(),
})
