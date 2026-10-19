import type { AsarUpdateState, UpdateState } from '../update'
import { defineDomain, invoke, push } from '../../domain'

/**
 * 更新域契约：整包 + asar 热更。
 */
export const updateDomain = defineDomain('update', {
  /** 触发检查更新（dev 下为空操作） */
  check: invoke<() => void>(),
  /** 重启应用以生效更新：有 asar 热更 pending → 重启替换；有整包已下载 → 安装器重启（Shell 专属） */
  install: invoke<() => void>(),
  /** 取消进行中的 asar 热更下载（无进行中下载为空操作，状态归位 idle） */
  cancelAsarDownload: invoke<() => void>(),
  /** 当前整包更新状态快照（先拉后推：页面先取快照再订阅 stateUpdated） */
  getState: invoke<() => UpdateState>(),
  /** 当前 asar 热更状态快照（先拉后推：页面先取快照再订阅 asarStateUpdated） */
  getAsarState: invoke<() => AsarUpdateState>(),

  // ---- Main → Renderer 推送 ----
  /** 整包更新状态变化推送（全量快照） */
  stateUpdated: push<[UpdateState]>(),
  /** asar 热更状态变化推送（全量快照，pending = 重启应用生效） */
  asarStateUpdated: push<[AsarUpdateState]>(),
})
