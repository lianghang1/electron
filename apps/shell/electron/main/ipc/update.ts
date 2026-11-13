import type { CallerRegistry } from '@shell/shared'
import type { UpdateCenter } from '@shell/update'
import { registerIpcDomain } from '@shell/bridge/handle'
import { SHELL_APP_ID } from '@shell/shared'
import { updateDomain } from '@shell/shared/ipc'
import { app } from 'electron'
import { callerOf } from './caller'

export interface UpdateIpcDeps {
  callers: CallerRegistry
  updateCenter: UpdateCenter | undefined
  markGracefulExit: () => void
}

/** update 域注册：install 仅工作台可调用，pending 优先重启 */
export function registerUpdateIpc(deps: UpdateIpcDeps): void {
  registerIpcDomain(updateDomain, {
    state: () => deps.updateCenter?.getState() ?? { status: 'idle' },
    cancel: () => deps.updateCenter?.cancel(),
    install: async (e) => {
      if (callerOf(deps.callers, e.sender.id).appId !== SHELL_APP_ID) { throw new Error('仅工作台可安装更新') }
      if (deps.updateCenter?.hasPendingRestart()) {
        deps.markGracefulExit()
        app.relaunch()
        app.quit()
        return
      }
      await deps.updateCenter?.checkAndApply()
    },
  })
}
