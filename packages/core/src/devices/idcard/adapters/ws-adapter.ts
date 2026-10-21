import type { IdCardAdapter, IdCardData, IdReaderDevice } from '../types'
import { idCardError } from '../errors'
import { CAMSDK_WS_READER, probeCamSdkReader, readIdCardViaCamSdk } from '../vendors/camsdk-ws'

/**
 * ws 路线适配器（CamSDKServer 本地服务，身份证域）。
 * 主进程直连 ws（纯 JSON 文本帧协议、无 native 依赖），不经设备守护进程——
 * 与 dll 路线（koffi 调用须崩溃隔离）的装配差异即在于此。厂商协议内聚 vendors/camsdk-ws.ts。
 * 服务地址可配置：经 getUrl 惰性取值（域配置 setConfig 热生效，无需重建适配器）。
 */
export class WsIdAdapter implements IdCardAdapter {
  readonly transport = 'ws' as const

  constructor(private readonly getUrl: () => string) {}

  async listReaders(): Promise<IdReaderDevice[]> {
    const url = this.getUrl()
    const alive = await probeCamSdkReader(url)
    return [{
      id: CAMSDK_WS_READER.id,
      displayName: CAMSDK_WS_READER.displayName,
      brand: CAMSDK_WS_READER.brand,
      transport: 'ws',
      status: alive ? 'ready' : 'offline',
      capabilities: ['idcard'],
      meta: {
        url,
        note: alive ? '本地服务运行中' : 'CamSDKServer 未运行（需安装 CamSDK 服务端）',
      },
    }]
  }

  async read(device: IdReaderDevice): Promise<IdCardData> {
    if (device.status !== 'ready') {
      throw idCardError('DEVICE_OFFLINE', `读卡器不可用: ${String(device.meta.note ?? device.status)}`)
    }
    return readIdCardViaCamSdk(this.getUrl())
  }
}
