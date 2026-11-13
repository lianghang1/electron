import type { AppService } from '@shell/app-runtime'
import type { WindowSystem } from '@shell/window'
import { registerIpcDomain } from '@shell/bridge/handle'
import { appsDomain } from '@shell/shared/ipc'

export interface AppsIpcDeps {
  apps: AppService
  windows: WindowSystem
}

/** apps 域注册：open 返回值是 IPC 边界投影（实例内部持有视图 / 窗口引用不可克隆，只出渲染层需要的纯数据） */
export function registerAppsIpc(deps: AppsIpcDeps): void {
  registerIpcDomain(appsDomain, {
    list: () => deps.apps.list(),
    open: async (_e, appId) => {
      const instance = await deps.apps.open(appId)
      return {
        instanceId: instance.instanceId,
        appId: instance.appId,
        state: instance.state,
        handle: { route: instance.handle.route },
      }
    },
    close: (_e, instanceId) => deps.apps.close(instanceId),
    activate: (_e, instanceId) => deps.windows.activate(instanceId),
  })
}
