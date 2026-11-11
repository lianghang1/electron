import type { IdcardDeviceConfig } from '@shell/shared'
import type { DeviceHost } from '../../../host/device-host'
import type { IdCardChannel, IdCardData, IdReaderDevice } from '../device-contracts'

/**
 * DLL 路线通道（主进程侧守护进程 proxy，身份证域）：
 * 华视/科密等 C 接口 SDK 的真实调用全部在设备守护进程（utilityProcess）内执行，
 * 本通道仅做请求转发——native 崩溃只炸守护进程，由 DeviceHost 退避重启自愈。
 * 枚举为档案驱动：dll 档案列表决定列出哪些驱动（档案 id = 驱动名，见 configs.ts），
 * 守护进程驱动注册表只作在位状态源；显示信息以档案为准。
 */
export class DllIdChannel implements IdCardChannel {
  readonly transport = 'dll' as const

  constructor(
    private readonly host: DeviceHost,
    /** 设备资源根（DLL 相对寻址基准），随请求传给守护进程 */
    private readonly resourcesRoot: string,
    private readonly getProfiles: () => IdcardDeviceConfig[],
  ) {}

  async listReaders(): Promise<IdReaderDevice[]> {
    const profiles = this.getProfiles().filter(p => p.transport === 'dll')
    const daemonDevices = await this.host
      .request<IdReaderDevice[]>('idcard.listReaders', { resourcesRoot: this.resourcesRoot })
      .catch(() => [])
    return profiles.map((profile) => {
      const found = daemonDevices.find(d => d.id === `dll:${profile.id}`)
      if (!found) {
        return {
          id: `dll:${profile.id}`,
          displayName: profile.displayName,
          brand: profile.brand,
          transport: 'dll' as const,
          status: 'offline' as const,
          capabilities: ['idcard'],
          meta: { note: '驱动未注册或设备未在位（守护进程未上报）' },
        }
      }
      return { ...found, displayName: profile.displayName, brand: profile.brand }
    })
  }

  async read(device: IdReaderDevice): Promise<IdCardData> {
    return this.host.request<IdCardData>('idcard.read', this.payloadOf(device))
  }

  /** 设备 ID 约定（全系统同构）：<transport>:<驱动名> */
  private payloadOf(device: IdReaderDevice): { resourcesRoot: string, driverName: string } {
    return { resourcesRoot: this.resourcesRoot, driverName: device.id.slice(this.transport.length + 1) }
  }
}
