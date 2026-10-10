import type { DeviceHost } from '../../host/device-host'
import type { IcCardData, IcCardReadRequest, IcCardWriteRequest, IdCardAdapter, IdCardData, IdReaderDevice } from '../types'

/**
 * DLL 路线适配器（主进程侧守护进程 proxy）：
 * 华视/德卡/科密等 C 接口 SDK 的真实调用全部在设备守护进程（utilityProcess）内执行，
 * 本适配器仅做请求转发——native 崩溃只炸守护进程，由 DeviceHost 退避重启自愈。
 * 驱动注册表与会话逻辑见 host/run.ts（厂商接入 = 驱动类 + 注册表一行）。
 */
export class DllIdAdapter implements IdCardAdapter {
  readonly transport = 'dll' as const

  constructor(
    private readonly host: DeviceHost,
    /** 设备资源根（DLL 相对寻址基准），随请求传给守护进程 */
    private readonly resourcesRoot: string,
  ) {}

  async listReaders(): Promise<IdReaderDevice[]> {
    return this.host.request<IdReaderDevice[]>('idcard.listReaders', { resourcesRoot: this.resourcesRoot })
  }

  async read(device: IdReaderDevice): Promise<IdCardData> {
    return this.host.request<IdCardData>('idcard.read', this.payloadOf(device))
  }

  async readIc(device: IdReaderDevice, req: IcCardReadRequest): Promise<IcCardData> {
    return this.host.request<IcCardData>('idcard.readIc', { ...this.payloadOf(device), req })
  }

  async writeIc(device: IdReaderDevice, req: IcCardWriteRequest): Promise<void> {
    await this.host.request<void>('idcard.writeIc', { ...this.payloadOf(device), req })
  }

  /** 设备 ID 约定（全系统同构）：<transport>:<驱动名> */
  private payloadOf(device: IdReaderDevice): { resourcesRoot: string, driverName: string } {
    return { resourcesRoot: this.resourcesRoot, driverName: device.id.slice(this.transport.length + 1) }
  }
}
