import type { PermissionService } from '@shell/app-runtime'
import type { DeviceGateway } from '@shell/devices'
import type { CallerRegistry } from '@shell/shared'
import { registerIpcDomain } from '@shell/bridge/handle'
import { deviceConfigDomain } from '@shell/shared/ipc'
import { authorized } from './caller'

export interface DeviceConfigIpcDeps {
  callers: CallerRegistry
  permissions: PermissionService
  devices: DeviceGateway
}

/**
 * deviceConfig 域注册：各能力参数读写与演示模式切换，均为平台管理动作。
 * 放行按权限声明（'deviceConfig'）：平台自身经自授权规则，平台管理页经 manifest
 * permissions 声明（buildAppPermissionRules），未声明一律拒绝。
 */
export function registerDeviceConfigIpc(deps: DeviceConfigIpcDeps): void {
  const manage = (senderId: number): Promise<string> => authorized(deps, senderId, 'deviceConfig')
  registerIpcDomain(deviceConfigDomain, {
    snapshot: async (e, capabilityId) => {
      await manage(e.sender.id)
      return deps.devices.configCenter.snapshot(capabilityId)
    },
    apply: async (e, input) => {
      await manage(e.sender.id)
      await deps.devices.applyConfig(input.capabilityId, input.deviceProfileId, input.patch ?? {})
      return deps.devices.configCenter.snapshot(input.capabilityId)
    },
    reset: async (e, capabilityId) => {
      await manage(e.sender.id)
      await deps.devices.resetConfig(capabilityId)
      return deps.devices.configCenter.snapshot()
    },
    demoMode: async (e) => {
      await manage(e.sender.id)
      return deps.devices.isDemoMode()
    },
    setDemoMode: async (e, enabled) => {
      await manage(e.sender.id)
      deps.devices.setDemoMode(Boolean(enabled))
      return deps.devices.isDemoMode()
    },
  })
}
