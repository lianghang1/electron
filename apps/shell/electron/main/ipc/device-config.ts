import type { DeviceGateway } from '@shell/devices'
import type { CallerRegistry, FlavorManifest } from '@shell/shared'
import { registerIpcDomain } from '@shell/bridge/handle'
import { SHELL_APP_ID } from '@shell/shared'
import { deviceConfigDomain } from '@shell/shared/ipc'
import { callerOf } from './caller'

export interface DeviceConfigIpcDeps {
  callers: CallerRegistry
  devices: DeviceGateway
  flavor: FlavorManifest
}

/**
 * deviceConfig 域注册：各能力参数读写与演示模式切换，均为平台管理动作。
 * 诊断台是验机形态的 embedded 应用（appId 非 shell），故按「平台自身 + 验机形态」放行，
 * 第三方应用一律拒绝。
 */
export function registerDeviceConfigIpc(deps: DeviceConfigIpcDeps): void {
  const assertDeviceConfigCaller = (senderId: number): void => {
    const appId = callerOf(deps.callers, senderId).appId
    if (appId !== SHELL_APP_ID && !deps.flavor.diagnostics) {
      throw new Error('仅平台工作台可修改设备配置')
    }
  }
  registerIpcDomain(deviceConfigDomain, {
    snapshot: (e, capabilityId) => {
      assertDeviceConfigCaller(e.sender.id)
      return deps.devices.configCenter.snapshot(capabilityId)
    },
    apply: async (e, capabilityId, deviceProfileId, patch) => {
      assertDeviceConfigCaller(e.sender.id)
      await deps.devices.applyConfig(capabilityId, deviceProfileId, patch ?? {})
      return deps.devices.configCenter.snapshot(capabilityId)
    },
    reset: async (e, capabilityId) => {
      assertDeviceConfigCaller(e.sender.id)
      await deps.devices.resetConfig(capabilityId)
      return deps.devices.configCenter.snapshot()
    },
    demoMode: (e) => {
      assertDeviceConfigCaller(e.sender.id)
      return deps.devices.isDemoMode()
    },
    setDemoMode: (e, enabled) => {
      assertDeviceConfigCaller(e.sender.id)
      deps.devices.setDemoMode(Boolean(enabled))
      return deps.devices.isDemoMode()
    },
  })
}
