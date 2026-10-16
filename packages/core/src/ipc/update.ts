import type { AsarUpdateService } from '../updater/asar-update-service'
import type { UpdateService } from '../updater/update-service'
import { handle } from './handle'

export interface UpdateIpcDeps {
  /** updates.url 未配置时为空：整包更新不启用 */
  updateService?: UpdateService
  /** updates.asar 未配置时为空：asar 热更不启用 */
  asarService?: AsarUpdateService
}

/**
 * 更新域通道注册：任一更新方式配置即启用；install 为统一入口（asar pending 优先）。
 */
export function registerUpdateIpc(deps: UpdateIpcDeps): void {
  const { updateService, asarService } = deps
  if (!updateService && !asarService) { return }

  handle('update:check', () => {
    void asarService?.check()
    updateService?.check()
  })
  handle('update:install', () => {
    if (asarService?.hasPending()) {
      asarService.install()
      return
    }
    updateService?.install()
  })
}
