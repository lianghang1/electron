import type { IdcardConfig } from '@desktop/shared'
import type { Logger } from '../../logger/logger'
import type { DeviceHost } from '../host/device-host'
import type { IdCardAdapter, IdCardData, IdReaderDevice } from './types'
import { createDeviceStore } from '../../storage/device-store'
import { deviceLockKey, SerialLocks } from '../kernel/serial-lock'
import { DllIdAdapter } from './adapters/dll-adapter'
import { WsIdAdapter } from './adapters/ws-adapter'
import { idCardError, toIdCardError } from './errors'
import { CAMSDK_WS_READER } from './vendors/camsdk-ws'

/** idcard 域配置出厂缺省（ws 服务地址可经 IPC 配置覆盖，持久化 device-idcard.json） */
export const IDCARD_CONFIG_DEFAULTS: IdcardConfig = {
  wsUrl: CAMSDK_WS_READER.url,
}

/**
 * IdCardService = 身份证阅读域统一 API（与 print/capture/iccard 同构）。
 * PII 红线：read 结果只经返回值传递；任何分支不得 console.log/落盘证件号或照片。
 * 日志注入：宿主传入 logger；模块内仅记录设备 ID 与结果状态，绝不记录证件数据。
 * 异常契约：失败抛 IdCardError（code 见 IdReaderErrorCode），IPC 层统一留痕后跨进程透传。
 */
export class IdCardService {
  private readonly adapters: Map<string, IdCardAdapter>
  /** 同一读卡器同一时刻只能执行一次读卡（硬件限制），按锁 key（设备或 lockGroup）串行化 */
  private readonly locks = new SerialLocks()
  /** 域配置（ws 服务地址；写穿 device-idcard.json，读侧内存直取） */
  private config: IdcardConfig
  private readonly configStore = createDeviceStore<IdcardConfig>('idcard', IDCARD_CONFIG_DEFAULTS)

  constructor(resourcesRoot: string, host: DeviceHost, private readonly logger: Logger) {
    this.config = this.configStore.load()
    this.adapters = new Map<string, IdCardAdapter>([
      // dll 路线经设备守护进程执行（koffi 调用崩溃隔离在 host 进程）
      ['dll', new DllIdAdapter(host, resourcesRoot)],
      // ws 路线主进程直连 CamSDKServer（纯 JSON 文本帧，无 native 依赖，无需守护进程）
      ['ws', new WsIdAdapter(() => this.config.wsUrl)],
    ])
  }

  getConfig(): IdcardConfig {
    return { ...this.config }
  }

  /** 更新域配置（补丁合并；入参合法性由 IPC 层 sanitize，此层只负责写穿持久化） */
  setConfig(patch: Partial<IdcardConfig>): IdcardConfig {
    this.config = { ...this.config, ...patch }
    this.configStore.save(this.config)
    return { ...this.config }
  }

  async listReaders(): Promise<IdReaderDevice[]> {
    const groups = await Promise.all([...this.adapters.values()].map(a => a.listReaders().catch(() => [])))
    return groups.flat()
  }

  async read(req: { deviceId: string }): Promise<IdCardData> {
    try {
      const located = await this.locate(req?.deviceId)
      return await this.locks.run(deviceLockKey(located.device), () => located.adapter.read(located.device))
    }
    catch (err) {
      throw this.logFailure(req?.deviceId, err)
    }
  }

  /** 设备定位与状态校验（读卡共用前置）：能力匹配由适配器判（域内驱动均具备身份证能力） */
  private async locate(deviceId: string | undefined): Promise<{ adapter: IdCardAdapter, device: IdReaderDevice }> {
    if (!deviceId) {
      throw idCardError('VALIDATION_FAILED', '缺少 deviceId')
    }
    const transport = deviceId.split(':')[0]
    const adapter = this.adapters.get(transport)
    if (!adapter) {
      throw idCardError('ADAPTER_UNAVAILABLE', `未知接入方式: ${transport}`)
    }
    const readers = await adapter.listReaders()
    const device = readers.find(d => d.id === deviceId)
    if (!device) {
      throw idCardError('DEVICE_NOT_FOUND', `未找到读卡器: ${deviceId}`)
    }
    if (device.status !== 'ready') {
      throw idCardError(
        device.status === 'unavailable' ? 'ADAPTER_UNAVAILABLE' : 'DEVICE_OFFLINE',
        `读卡器不可用: ${String(device.meta.note ?? device.status)}`,
      )
    }
    return { adapter, device }
  }

  /** 失败留痕（设备 ID + 错误码，不含证件数据）后原样抛出 */
  private logFailure(deviceId: string | undefined, err: unknown): unknown {
    const ce = toIdCardError(err)
    this.logger.error(`读卡失败 ${deviceId ?? '(未指定)'}`, { code: ce.code, message: ce.message })
    return err
  }

  destroy(): void {
    for (const a of this.adapters.values()) { a.destroy?.() }
  }
}
