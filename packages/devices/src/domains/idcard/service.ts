import type { Logger } from '@shell/kernel/logger'
import type { IdcardConfig, IdcardDeviceConfig, IdcardDeviceOverrides } from '@shell/shared'
import type { DeviceHost } from '../../host/device-host'
import type { IdCardChannel, IdCardData, IdReaderDevice } from './device-contracts'
import { deviceLockKey, SerialLocks } from '../../kernel/serial-lock'
import { createDeviceStore } from '../../storage/device-store'
import { DllIdChannel } from './channels/dll-channel'
import { WsIdChannel } from './channels/ws-channel'
import { BUILT_IN_IDCARD_CONFIGS } from './configs'
import { idCardError, toIdCardError } from './errors'

/**
 * 持久化根对象（electron-store 根必须为对象，数组经 devices 包一层）。
 * devices 为白名单覆盖（仅现场可调字段），按同名字段读取，技术字段随代码出厂。
 */
interface StoredIdcardConfig {
  devices?: IdcardDeviceOverrides[]
}

/** 档案深拷贝（出厂合并/读出 clone，避免共享内层对象被运行时误改） */
function cloneProfile(p: IdcardDeviceConfig): IdcardDeviceConfig {
  return p.transport === 'ws' ? { ...p, ws: { ...p.ws } } : { ...p }
}

/** 档案 → 白名单覆盖（持久化只写现场可调字段，技术字段永远随代码出厂） */
function overridesOf(p: IdcardDeviceConfig): IdcardDeviceOverrides {
  return p.transport === 'ws'
    ? { id: p.id, displayName: p.displayName, ws: { url: p.ws.url } }
    : { id: p.id, displayName: p.displayName }
}

/**
 * 持久化合并 + 白名单提取：以出厂整条为基准，stored 同 id 仅提取白名单字段
 * （displayName / ws.url）覆盖——代码修改任何技术字段（品牌/接入方式/驱动）立即生效。
 * 清单完全由代码预设决定（不回注用户追加档案）。
 */
function mergeStoredConfig(raw: StoredIdcardConfig): IdcardDeviceConfig[] {
  const stored = Array.isArray(raw.devices) ? raw.devices : []
  return BUILT_IN_IDCARD_CONFIGS.map((b) => {
    const profile = cloneProfile(b)
    const s = stored.find(x => x.id === b.id)
    if (s) {
      if (typeof s.displayName === 'string' && s.displayName.trim()) {
        profile.displayName = s.displayName
      }
      if (profile.transport === 'ws' && typeof s.ws?.url === 'string' && s.ws.url.trim()) {
        profile.ws.url = s.ws.url
      }
    }
    return profile
  })
}

/**
 * IdCardService = 身份证阅读域统一 API（与 print/capture/iccard 同构）。
 * PII 红线：read 结果只经返回值传递；任何分支不得 console.log/落盘证件号或照片。
 * 日志注入：宿主传入 logger；模块内仅记录设备 ID 与结果状态，绝不记录证件数据。
 * 异常契约：失败抛 IdCardError（code 见 IdReaderErrorCode），IPC 层统一留痕后跨进程透传。
 */
export class IdCardService {
  private readonly channels: Map<string, IdCardChannel>
  /** 同一读卡器同一时刻只能执行一次读卡（硬件限制），按锁 key（设备或 lockGroup）串行化 */
  private readonly locks = new SerialLocks()
  /** 设备档案（ws/dll 双路线，见 configs.ts；写穿 device-idcard.json，读侧内存直取） */
  private configs: IdcardConfig
  private readonly configStore = createDeviceStore<StoredIdcardConfig>('idcard')

  constructor(resourcesRoot: string, host: DeviceHost, private readonly logger: Logger) {
    this.configs = mergeStoredConfig(this.configStore.load())
    this.channels = new Map<string, IdCardChannel>([
      // dll 路线经设备守护进程执行（koffi 调用崩溃隔离在 host 进程），档案驱动枚举
      ['dll', new DllIdChannel(host, resourcesRoot, () => this.configs)],
      // ws 路线主进程直连（纯 JSON 文本帧，无 native 依赖，无需守护进程），按档案多连接枚举
      ['ws', new WsIdChannel(() => this.configs)],
    ])
  }

  getConfig(): IdcardConfig {
    return this.configs.map(cloneProfile)
  }

  /** 现场白名单覆盖（档案 id 必须为出厂预设项；入参合法性由 IPC 层 sanitize），写穿持久化 */
  setConfig(id: string, overrides: IdcardDeviceOverrides): IdcardConfig {
    if (!this.configs.some(p => p.id === id)) {
      throw idCardError('VALIDATION_FAILED', `设备档案不存在: ${id}`)
    }
    const merged = this.configs.map((p) => {
      if (p.id !== id) {
        return p
      }
      const next = cloneProfile(p)
      if (typeof overrides.displayName === 'string' && overrides.displayName.trim()) {
        next.displayName = overrides.displayName
      }
      if (next.transport === 'ws' && typeof overrides.ws?.url === 'string' && overrides.ws.url.trim()) {
        next.ws.url = overrides.ws.url
      }
      return next
    })
    return this.writeThrough(merged)
  }

  private writeThrough(configs: IdcardConfig): IdcardConfig {
    this.configs = configs
    this.configStore.save({ devices: configs.map(overridesOf) })
    return this.getConfig()
  }

  async listDevices(): Promise<IdReaderDevice[]> {
    const groups = await Promise.all([...this.channels.values()].map(a => a.listReaders().catch(() => [])))
    return groups.flat()
  }

  async readCard(req: { deviceId: string }): Promise<IdCardData> {
    try {
      const located = await this.locate(req?.deviceId)
      return await this.locks.run(deviceLockKey(located.device), () => located.channel.read(located.device))
    }
    catch (err) {
      throw this.logFailure(req?.deviceId, err)
    }
  }

  /** 设备定位与状态校验（读卡共用前置）：能力匹配由通道判（域内驱动均具备身份证能力） */
  private async locate(deviceId: string | undefined): Promise<{ channel: IdCardChannel, device: IdReaderDevice }> {
    if (!deviceId) {
      throw idCardError('VALIDATION_FAILED', '缺少 deviceId')
    }
    const transport = deviceId.split(':')[0]
    const channel = this.channels.get(transport)
    if (!channel) {
      throw idCardError('CHANNEL_UNAVAILABLE', `未知接入方式: ${transport}`)
    }
    const readers = await channel.listReaders()
    const device = readers.find(d => d.id === deviceId)
    if (!device) {
      throw idCardError('DEVICE_NOT_FOUND', `未找到读卡器: ${deviceId}`)
    }
    if (device.status !== 'ready') {
      throw idCardError(
        device.status === 'unavailable' ? 'CHANNEL_UNAVAILABLE' : 'DEVICE_OFFLINE',
        `读卡器不可用: ${String(device.meta.note ?? device.status)}`,
      )
    }
    return { channel, device }
  }

  /** 失败留痕（设备 ID + 错误码 + 驱动阶段信息，不含证件数据）后原样抛出 */
  private logFailure(deviceId: string | undefined, err: unknown): unknown {
    const ce = toIdCardError(err)
    this.logger.error(`读卡失败 ${deviceId ?? '(未指定)'}`, { code: ce.code, message: ce.message, ...(ce.detail !== undefined ? { detail: ce.detail } : {}) })
    return err
  }

  destroy(): void {
    for (const a of this.channels.values()) { a.destroy?.() }
  }
}
