import type { IdcardConfig, IdcardDeviceConfig } from '@desktop/shared'
import type { Logger } from '../../logger/logger'
import type { DeviceHost } from '../host/device-host'
import type { IdCardAdapter, IdCardData, IdReaderDevice } from './types'
import { createDeviceStore } from '../../storage/device-store'
import { deviceLockKey, SerialLocks } from '../kernel/serial-lock'
import { DllIdAdapter } from './adapters/dll-adapter'
import { WsIdAdapter } from './adapters/ws-adapter'
import { BUILT_IN_IDCARD_CONFIGS } from './configs'
import { idCardError, toIdCardError } from './errors'

/** 持久化根对象（electron-store 根必须为对象，数组经 devices 包一层）+ 旧版单值字段（迁移读） */
interface StoredIdcardConfig {
  devices?: IdcardDeviceConfig[]
  /** 旧版单值形态：ws 服务地址（识别到即迁移为出厂档案 + 旧地址） */
  wsUrl?: string
}

/** 档案深拷贝（出厂回注/读出 clone，避免共享内层对象被运行时误改） */
function cloneProfile(p: IdcardDeviceConfig): IdcardDeviceConfig {
  return p.transport === 'ws' ? { ...p, ws: { ...p.ws } } : { ...p, dll: { ...p.dll } }
}

/**
 * 旧持久化迁移 + 出厂回注：
 * - 旧版单值 { wsUrl }：地址保留迁入出厂 ws 档案（stored 无该档案时生效）；
 * - 出厂档案按 id 补齐缺失项（内置设备始终可管理，删除仅当次运行生效），用户追加档案在后。
 */
function migrateConfig(raw: StoredIdcardConfig): IdcardDeviceConfig[] {
  const stored = Array.isArray(raw.devices) ? raw.devices : []
  const legacyUrl = typeof raw.wsUrl === 'string' && raw.wsUrl ? raw.wsUrl : undefined
  const builtIns = BUILT_IN_IDCARD_CONFIGS.map(cloneProfile)
  if (legacyUrl) {
    for (const p of builtIns) {
      if (p.transport === 'ws' && !stored.some(s => s.id === p.id)) {
        p.ws.url = legacyUrl
      }
    }
  }
  return builtIns
    .map(b => stored.find(s => s.id === b.id) ?? b)
    .concat(stored.filter(s => !builtIns.some(b => b.id === s.id)))
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
  /** 设备档案（ws/dll 双路线，见 configs.ts；写穿 device-idcard.json，读侧内存直取） */
  private configs: IdcardConfig
  private readonly configStore = createDeviceStore<StoredIdcardConfig>('idcard')

  constructor(resourcesRoot: string, host: DeviceHost, private readonly logger: Logger) {
    this.configs = migrateConfig(this.configStore.load())
    this.adapters = new Map<string, IdCardAdapter>([
      // dll 路线经设备守护进程执行（koffi 调用崩溃隔离在 host 进程），档案驱动枚举
      ['dll', new DllIdAdapter(host, resourcesRoot, () => this.configs)],
      // ws 路线主进程直连（纯 JSON 文本帧，无 native 依赖，无需守护进程），按档案多连接枚举
      ['ws', new WsIdAdapter(() => this.configs)],
    ])
  }

  getConfig(): IdcardConfig {
    return this.configs.map(cloneProfile)
  }

  /** 按档案 id upsert（入参合法性由 IPC 层 sanitize），写穿持久化 */
  setConfig(next: IdcardDeviceConfig): IdcardConfig {
    const configs = this.configs.some(p => p.id === next.id)
      ? this.configs.map(p => (p.id === next.id ? next : p))
      : [...this.configs, next]
    return this.writeThrough(configs)
  }

  /** 按档案 id 删除；返回是否有删除动作 */
  removeConfig(id: string): boolean {
    if (!this.configs.some(p => p.id === id)) {
      return false
    }
    this.writeThrough(this.configs.filter(p => p.id !== id))
    return true
  }

  private writeThrough(configs: IdcardConfig): IdcardConfig {
    this.configs = configs
    this.configStore.save({ devices: this.getConfig() })
    return this.getConfig()
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
