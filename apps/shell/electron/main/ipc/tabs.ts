import type { CallerRegistry } from '@shell/shared'
import type { WindowSystem } from '@shell/window'
import { registerIpcDomain } from '@shell/bridge/handle'
import { tabsDomain } from '@shell/shared/ipc'
import { callerOf } from './caller'

export interface TabsIpcDeps {
  callers: CallerRegistry
  windows: WindowSystem
}

/** tabs 域注册：reload 为管理动作（校验调用方已登记）；setWorkArea 为高频单向 send */
export function registerTabsIpc(deps: TabsIpcDeps): void {
  registerIpcDomain(tabsDomain, {
    reload: (_e, instanceId) => {
      callerOf(deps.callers, _e.sender.id)
      deps.windows.reload(instanceId)
    },
    setWorkArea: (_e, rect) => deps.windows.setContentRect(rect),
  })
}
