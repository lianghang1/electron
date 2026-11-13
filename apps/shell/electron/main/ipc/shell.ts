import type { DeviceGateway, DeviceTelemetry } from '@shell/devices'
import type { PlatformKernel } from '@shell/kernel'
import type { FlavorManifest, PlatformCapability } from '@shell/shared'
import type { ForceUpdateGate, UpdateCenter } from '@shell/update'
import { registerIpcDomain } from '@shell/bridge/handle'
import { shellDomain } from '@shell/shared/ipc'
import { app } from 'electron'

export interface ShellInfoIpcDeps {
  kernel: PlatformKernel
  capability: PlatformCapability
  devices: DeviceGateway
  telemetry: DeviceTelemetry
  flavor: FlavorManifest
  version: () => string
  updateCenter: UpdateCenter | undefined
  forceGate: ForceUpdateGate | undefined
  markGracefulExit: () => void
}

/**
 * shell 域注册：壳信息快照 / 重启 / 立即更新。
 * info 的能力矩阵下发让业务页按 availableDomains 决定功能可用性，无需自行判断平台。
 */
export function registerShellInfoIpc(deps: ShellInfoIpcDeps): void {
  registerIpcDomain(shellDomain, {
    info: () => ({
      name: deps.flavor.name,
      version: deps.version(),
      defaultAppId: deps.flavor.defaultAppId,
      mode: deps.flavor.mode,
      // 门禁快照：渲染层启动即知是否阻断，后续变化经 update.force-required 事件推送
      forceUpdate: deps.forceGate?.snapshot,
      capabilities: {
        platform: deps.capability.platform,
        availableDomains: [...deps.capability.availableDomains],
        driverDeployment: deps.capability.driverDeployment,
        notes: deps.capability.notes,
      },
      deviceStatus: [...deps.devices.deviceStatuses],
      deviceTelemetry: deps.telemetry.snapshot(),
      // 启动门禁依据：预热未完成时渲染层设备入口进入「初始化中」过渡态（就绪经 devices.ready 事件推送）
      deviceHostReady: deps.kernel.ctx.marks.t2DeviceHostReady !== undefined,
    }),
    // 重启壳：quit 会触发 before-quit，把暂存的整包安装执行掉，再以新版本拉起
    relaunch: () => {
      deps.markGracefulExit()
      app.relaunch()
      app.quit()
    },
    // 门禁页主动更新入口：巡检并应用；需重启时经 update.restart-required 事件回传
    updateNow: () => deps.updateCenter?.checkAndApply(),
  })
}
