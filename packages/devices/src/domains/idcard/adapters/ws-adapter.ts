import type { IdcardDeviceConfig, IdcardWsProfile } from '@shell/shared'
import type { IdCardAdapter, IdCardData, IdReaderDevice } from '../types'
import { idCardError } from '../errors'
import { probeCamSdkReader, readIdCardViaCamSdk } from '../vendors/camsdk-ws'

/**
 * ws 路线适配器（CamSDKServer 本地服务，身份证域，多档案）：
 * 一条档案 = 一条服务连接，服务下全部读卡器经该连接枚举（无读卡器枚举 API，可用性以探活为准）。
 * 主进程直连 ws（纯 JSON 文本帧协议、无 native 依赖），不经设备守护进程——
 * 与 dll 路线（koffi 调用须崩溃隔离）的装配差异即在于此。厂商协议内聚 vendors/camsdk-ws.ts。
 * 档案列表经 getter 惰性取值（域配置 setConfig 热生效，无需重建适配器）。
 */
export class WsIdAdapter implements IdCardAdapter {
  readonly transport = 'ws' as const

  constructor(private readonly getProfiles: () => IdcardDeviceConfig[]) {}

  /** ws 档案子集（union 收窄：dll 档案不经本适配器） */
  private wsProfiles(): IdcardWsProfile[] {
    return this.getProfiles().filter((p): p is IdcardWsProfile => p.transport === 'ws')
  }

  async listReaders(): Promise<IdReaderDevice[]> {
    return Promise.all(this.wsProfiles().map(async (profile) => {
      const alive = await probeCamSdkReader(profile.ws.url).catch(() => false)
      return {
        id: `${this.transport}:${profile.id}`,
        displayName: profile.displayName,
        brand: profile.brand,
        transport: this.transport,
        status: alive ? 'ready' as const : 'offline' as const,
        capabilities: ['idcard'],
        meta: {
          url: profile.ws.url,
          note: alive ? '本地服务运行中' : 'CamSDKServer 未运行（需安装 CamSDK 服务端）',
        },
      }
    }))
  }

  async read(device: IdReaderDevice): Promise<IdCardData> {
    if (device.status !== 'ready') {
      throw idCardError('DEVICE_OFFLINE', `读卡器不可用: ${String(device.meta.note ?? device.status)}`)
    }
    const profile = this.wsProfiles().find(p => device.id === `${this.transport}:${p.id}`)
    if (!profile) {
      throw idCardError('DEVICE_NOT_FOUND', `未找到读卡器对应档案: ${device.id}`)
    }
    return readIdCardViaCamSdk(profile.ws.url)
  }
}
