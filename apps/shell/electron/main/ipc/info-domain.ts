import type { DeviceStatus } from '@shell/devices'
import type { DomainDefinition } from '@shell/shared'
import { defineDomain, infoSnapshotSchema } from '@shell/shared'
import { z } from 'zod'

/** info 域 id：路由层开放域清单与权限 grant 共用 */
export const INFO_DOMAIN_ID = 'info'

/** info 域数据源：组合根把装配事实注入，域内零跨模块取数 */
export interface InfoDomainSources {
  version: () => string
  flavorId: string
  platform: string
  availableDomains: readonly string[]
  deviceStatuses: () => readonly DeviceStatus[]
  /** appId → 清单声明的设备域与权限；未注册应用返回 undefined（快照置空） */
  manifestOf: (appId: string) => { devices: readonly string[], permissions: readonly string[] } | undefined
}

/** info 域：应用页运行时快照（自描述域，与设备域同一张路由表，grant 独立于设备能力矩阵） */
export function createInfoDomain(sources: InfoDomainSources): DomainDefinition {
  return defineDomain('info', {
    get: {
      input: z.undefined().optional(),
      output: infoSnapshotSchema,
      grant: INFO_DOMAIN_ID,
      handler: (_input, ctx) => {
        const manifest = sources.manifestOf(ctx.appId)
        return infoSnapshotSchema.parse({
          version: sources.version(),
          flavorId: sources.flavorId,
          platform: sources.platform,
          appId: ctx.appId,
          declaredDevices: manifest ? [...manifest.devices] : [],
          declaredPermissions: manifest ? [...manifest.permissions] : [],
          availableDomains: [...sources.availableDomains],
          deviceStatuses: sources.deviceStatuses().map(status => ({
            deviceId: status.deviceId,
            capabilityId: status.capabilityId,
            channelId: status.channelId,
            state: status.state,
            reason: status.reason,
            detail: status.detail,
          })),
        })
      },
    },
  })
}
