import type { SignatureConfig, SignDeviceConfig } from '@desktop/shared'
import type { Logger } from '../../logger/logger'
import type { DeviceHost } from '../host/device-host'
import type { SignAdapter, SignDevice, SignSessionResult, SignStartResult, SignStrokePoint } from './types'

import { createDeviceStore } from '../../storage/device-store'
import { DllSignAdapter } from './adapters/dll-adapter'
import { WsSignAdapter } from './adapters/ws-adapter'
import { BUILT_IN_SIGNATURE_CONFIGS } from './configs'
import { signatureError, toSignatureError } from './errors'

/** 持久化根对象（electron-store 根必须为对象，数组经 devices 包一层）+ 旧版单值字段（迁移读） */
interface StoredSignatureConfig {
  devices?: SignDeviceConfig[]
  /** 旧版单值形态：ws 服务地址（识别到即迁移为出厂档案 + 旧地址） */
  wsUrl?: string
}

/** 档案深拷贝（出厂回注/读出 clone，避免共享内层对象被运行时误改） */
function cloneProfile(p: SignDeviceConfig): SignDeviceConfig {
  return p.transport === 'ws' ? { ...p, ws: { ...p.ws } } : { ...p, dll: { ...p.dll } }
}

/**
 * 旧持久化迁移 + 出厂回注：
 * - 旧版单值 { wsUrl }：地址保留迁入出厂 ws 档案（stored 无该档案时生效）；
 * - 出厂档案按 id 补齐缺失项（内置设备始终可管理，删除仅当次运行生效），用户追加档案在后。
 */
function migrateConfig(raw: StoredSignatureConfig): SignDeviceConfig[] {
  const stored = Array.isArray(raw.devices) ? raw.devices : []
  const legacyUrl = typeof raw.wsUrl === 'string' && raw.wsUrl ? raw.wsUrl : undefined
  const builtIns = BUILT_IN_SIGNATURE_CONFIGS.map(cloneProfile)
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
 * SignatureService = 手写签名域统一 API（与 IdCardService 同构的归一化层）。
 * 会话约束：一个签名板同时只有一个会话，由本层集中持有（适配器各自兜底校验）。
 * 笔迹点只经 onStroke 回调转发给会话发起方（ipc 层绑定 webContents.send 推送），
 * 不写日志（板面笔迹视同用户输入内容）。失败统一抛 SignatureError。
 */
export class SignatureService {
  private readonly adapters: Map<string, SignAdapter>
  /** 活动会话：设备 ID + 发起方的笔迹推送回调 */
  private active: { deviceId: string, onStroke: (point: SignStrokePoint) => void } | null = null
  /** 设备档案（ws/dll 双路线，见 configs.ts；写穿 device-signature.json，读侧内存直取） */
  private configs: SignatureConfig
  private readonly configStore = createDeviceStore<StoredSignatureConfig>('signature')

  constructor(host: DeviceHost, resourcesRoot: string, private readonly logger: Logger) {
    this.configs = migrateConfig(this.configStore.load())
    this.adapters = new Map<string, SignAdapter>([
      // dll 路线经设备守护进程执行（崩溃隔离在 host 进程），档案驱动枚举
      ['dll', new DllSignAdapter(host, resourcesRoot, () => this.configs)],
      // ws 路线主进程直连（签名屏 PadViewer4，设备侧产位图），按档案多连接枚举
      ['ws', new WsSignAdapter(() => this.configs)],
    ])
  }

  getConfig(): SignatureConfig {
    return this.configs.map(cloneProfile)
  }

  /** 按档案 id upsert（入参合法性由 IPC 层 sanitize），写穿持久化 */
  setConfig(next: SignDeviceConfig): SignatureConfig {
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

  private writeThrough(configs: SignatureConfig): SignatureConfig {
    this.configs = configs
    this.configStore.save({ devices: this.getConfig() })
    return this.getConfig()
  }

  async listDevices(): Promise<SignDevice[]> {
    const groups = await Promise.all([...this.adapters.values()].map(a => a.listDevices().catch(() => [])))
    return groups.flat()
  }

  /** 开始会话：deviceId 缺省自动选第一个就绪设备；onStroke = 发起方的实时笔迹回调 */
  async start(req: { deviceId?: string } | undefined, onStroke: (point: SignStrokePoint) => void): Promise<SignStartResult> {
    try {
      const devices = await this.listDevices()
      const deviceId = req?.deviceId ?? devices.find(d => d.status === 'ready')?.id
      if (!deviceId) {
        throw signatureError('DEVICE_NOT_FOUND', '无可用签名设备')
      }
      const adapter = this.adapters.get(deviceId.split(':')[0])
      if (!adapter) {
        throw signatureError('ADAPTER_UNAVAILABLE', `未知接入方式: ${deviceId.split(':')[0]}`)
      }
      const device = devices.find(d => d.id === deviceId)
      if (!device) {
        throw signatureError('DEVICE_NOT_FOUND', `未找到签名设备: ${deviceId}`)
      }
      if (this.active) {
        throw signatureError('SESSION_ACTIVE', '签名会话进行中（先 stopSign/cancelSign）')
      }
      if (device.status !== 'ready') {
        throw signatureError(
          device.status === 'unavailable' ? 'ADAPTER_UNAVAILABLE' : 'DEVICE_OFFLINE',
          `签名设备不可用: ${String(device.meta.note ?? device.status)}`,
        )
      }
      // 先挂会话再启动：start 期间到达的首个笔迹点不丢；失败路径回滚
      this.active = { deviceId, onStroke }
      const result = await adapter.start(device, p => this.routeStroke(p))
      this.log('info', `签名会话开始 ${deviceId}`)
      return result
    }
    catch (err) {
      this.active = null
      const ce = toSignatureError(err)
      this.log('error', '签名会话启动失败', { code: ce.code })
      throw ce
    }
  }

  /** 结束会话并回收完整笔迹（无会话抛 SESSION_NOT_ACTIVE） */
  async stop(): Promise<SignSessionResult> {
    const adapter = this.activeAdapter()
    if (!adapter) {
      throw signatureError('SESSION_NOT_ACTIVE', '无进行中的签名会话')
    }
    try {
      const result = await adapter.stop()
      this.active = null
      this.log('info', `签名会话结束: ${result.strokeCount} 笔画`)
      return result
    }
    catch (err) {
      this.active = null
      throw toSignatureError(err)
    }
  }

  async clear(): Promise<void> {
    const adapter = this.activeAdapter()
    if (!adapter) {
      throw signatureError('SESSION_NOT_ACTIVE', '无进行中的签名会话')
    }
    await adapter.clear()
  }

  async cancel(): Promise<void> {
    const adapter = this.activeAdapter()
    if (!adapter) {
      throw signatureError('SESSION_NOT_ACTIVE', '无进行中的签名会话')
    }
    await adapter.cancel()
    this.active = null
    this.log('info', '签名会话取消')
  }

  destroy(): void {
    for (const a of this.adapters.values()) { a.destroy?.() }
    this.active = null
  }

  private activeAdapter(): SignAdapter | null {
    if (!this.active) {
      return null
    }
    return this.adapters.get(this.active.deviceId.split(':')[0]) ?? null
  }

  private routeStroke(point: SignStrokePoint): void {
    this.active?.onStroke(point)
  }

  private log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void {
    if (level === 'info') {
      this.logger.info(`${message}`, meta)
    }
    else if (level === 'warn') {
      this.logger.warn(`${message}`, meta)
    }
    else if (level === 'error') {
      this.logger.error(`${message}`, meta)
    }
  }
}
