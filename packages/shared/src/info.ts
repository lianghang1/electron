import { z } from 'zod'

/**
 * info 域契约：应用页查询自身运行时快照的唯一入口（只读，零副作用）。
 * 数据全部来自组合根装配事实（版本 / 能力矩阵 / 权限策略表 / 设备状态机），
 * 域 handler 只做透出，不产生任何新事实。
 */
export const infoSnapshotSchema = z.object({
  /** 壳有效版本（含热更合成） */
  version: z.string(),
  /** 产品形态 id */
  flavorId: z.string(),
  /** 构建目标平台 id（能力矩阵键，win32/darwin/...） */
  platform: z.string(),
  /** 调用方应用 id（受控桥身份账本反查，页面无法伪造） */
  appId: z.string(),
  /** 调用方清单声明的设备域（声明即放行，与权限策略 domain.* 规则同源） */
  declaredDevices: z.array(z.string()),
  /** 调用方清单声明的平台权限 */
  declaredPermissions: z.array(z.string()),
  /** 平台开放的能力域清单（三维求交闸门输入） */
  availableDomains: z.array(z.string()),
  /** 各能力设备状态快照（诊断台灰置同一事实源） */
  deviceStatuses: z.array(z.object({
    deviceId: z.string(),
    capabilityId: z.string(),
    channelId: z.string().optional(),
    state: z.string(),
    reason: z.string().optional(),
    detail: z.string().optional(),
  })),
})

export type InfoSnapshot = z.infer<typeof infoSnapshotSchema>
