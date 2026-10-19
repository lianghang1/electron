import type { AsarUpdateState, UpdateState } from '@desktop/shared'
import type { AsarUpdateService } from '../updater/asar-update-service'
import type { UpdateService } from '../updater/update-service'
import type { CallerResolver } from './caller-context'
import { assertShell } from './caller-context'
import { handle } from './handle'

const IDLE_UPDATE_STATE: UpdateState = { status: 'idle' }
const IDLE_ASAR_STATE: AsarUpdateState = { status: 'idle' }

export interface UpdateIpcDeps {
  /** updates.url 未配置时为空：整包更新不启用 */
  updateService?: UpdateService
  /** updates.asar 未配置时为空：asar 热更不启用 */
  asarService?: AsarUpdateService
  resolver: CallerResolver
}

/**
 * 更新域通道注册：任一更新方式配置即启用；install 为统一入口（asar pending 优先）。
 * install 触发应用重启，属破坏性操作，仅 Shell 可调用。
 */
export function registerUpdateIpc(deps: UpdateIpcDeps): void {
  const { updateService, asarService } = deps
  if (!updateService && !asarService) { return }

  handle('update:check', () => {
    void asarService?.check()
    updateService?.check()
  })
  handle('update:install', (e) => {
    assertShell(deps.resolver.resolve(e.sender))
    if (asarService?.hasPending()) {
      asarService.install()
      return
    }
    updateService?.install()
  })
  handle('update:cancelAsarDownload', () => {
    asarService?.cancel()
  })
  handle('update:getState', () => updateService?.getState() ?? IDLE_UPDATE_STATE)
  handle('update:getAsarState', () => asarService?.getState() ?? IDLE_ASAR_STATE)
}
