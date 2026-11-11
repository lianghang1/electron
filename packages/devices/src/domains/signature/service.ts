import type { Logger } from '@shell/kernel/logger'
import type { SignatureConfig, SignatureDeviceOverrides, SignDeviceConfig } from '@shell/shared'
import type { DeviceHost } from '../../host/device-host'
import type { SignChannel, SignDevice, SignSessionResult, SignStartResult, SignStrokePoint } from './device-contracts'

import { createDeviceStore } from '../../storage/device-store'
import { DllSignChannel } from './channels/dll-channel'
import { WsSignChannel } from './channels/ws-channel'
import { BUILT_IN_SIGNATURE_CONFIGS } from './configs'
import { signatureError, toSignatureError } from './errors'

/**
 * 持久化根对象（electron-store 根必须为对象，数组经 devices 包一层）。
 * devices 现为白名单覆盖（仅现场可调字段）；历史版本存过整条档案，
 * 白名单提取按同名字段读取，多余字段（旧 dll 段等）自然忽略。
 */
interface StoredSignatureConfig {
  devices?: SignatureDeviceOverrides[]
  /** 旧版单值形态：ws 服务地址（识别到即迁移为出厂档案 + 旧地址） */
  wsUrl?: string
}

/** 档案深拷贝（出厂合并/读出 clone，避免共享内层对象被运行时误改） */
function cloneProfile(p: SignDeviceConfig): SignDeviceConfig {
  return p.transport === 'ws' ? { ...p, ws: { ...p.ws } } : { ...p }
}

/** 档案 → 白名单覆盖（持久化只写现场可调字段，技术字段永远随代码出厂） */
function overridesOf(p: SignDeviceConfig): SignatureDeviceOverrides {
  return p.transport === 'ws'
    ? { id: p.id, displayName: p.displayName, ws: { url: p.ws.url } }
    : { id: p.id, displayName: p.displayName }
}

/**
 * 历史持久化合并 + 白名单提取：以出厂整条为基准，stored 同 id 仅提取白名单字段
 * （displayName / ws.url）覆盖——代码修改任何技术字段（品牌/接入方式/驱动）立即生效，
 * 本地旧数据不再整体压住出厂值。清单完全由代码预设决定（不回注用户追加档案）。
 */
function migrateConfig(raw: StoredSignatureConfig): SignDeviceConfig[] {
  const stored = Array.isArray(raw.devices) ? raw.devices : []
  const legacyUrl = typeof raw.wsUrl === 'string' && raw.wsUrl ? raw.wsUrl : undefined
  return BUILT_IN_SIGNATURE_CONFIGS.map((b) => {
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
    else if (legacyUrl && profile.transport === 'ws') {
      profile.ws.url = legacyUrl
    }
    return profile
  })
}

/**
 * SignatureService = 手写签名域统一 API（与 IdCardService 同构的归一化层）。
 * 会话约束：一个签名板同时只有一个会话，由本层集中持有（通道各自兜底校验）。
 * 笔迹点只经 onStroke 回调转发给会话发起方（ipc 层绑定 webContents.send 推送），
 * 不写日志（板面笔迹视同用户输入内容）。失败统一抛 SignatureError。
 */
export class SignatureService {
  private readonly channels: Map<string, SignChannel>
  /** 活动会话：设备 ID + 发起方的笔迹推送回调 */
  private active: { deviceId: string, onStroke: (point: SignStrokePoint) => void } | null = null
  /** 设备档案（ws/dll 双路线，见 configs.ts；写穿 device-signature.json，读侧内存直取） */
  private configs: SignatureConfig
  private readonly configStore = createDeviceStore<StoredSignatureConfig>('signature')

  constructor(host: DeviceHost, resourcesRoot: string, private readonly logger: Logger) {
    this.configs = migrateConfig(this.configStore.load())
    this.channels = new Map<string, SignChannel>([
      // dll 路线经设备守护进程执行（崩溃隔离在 host 进程），档案驱动枚举
      ['dll', new DllSignChannel(host, resourcesRoot, () => this.configs)],
      // ws 路线主进程直连（签名屏 PadViewer4，设备侧产位图），按档案多连接枚举
      ['ws', new WsSignChannel(() => this.configs)],
    ])
  }

  getConfig(): SignatureConfig {
    return this.configs.map(cloneProfile)
  }

  /** 现场白名单覆盖（档案 id 必须为出厂预设项；入参合法性由 IPC 层 sanitize），写穿持久化 */
  setConfig(id: string, overrides: SignatureDeviceOverrides): SignatureConfig {
    if (!this.configs.some(p => p.id === id)) {
      throw signatureError('VALIDATION_FAILED', `设备档案不存在: ${id}`)
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

  private writeThrough(configs: SignatureConfig): SignatureConfig {
    this.configs = configs
    this.configStore.save({ devices: configs.map(overridesOf) })
    return this.getConfig()
  }

  async listDevices(): Promise<SignDevice[]> {
    const groups = await Promise.all([...this.channels.values()].map(a => a.listDevices().catch(() => [])))
    return groups.flat()
  }

  /** 开始会话：deviceId 缺省自动选第一个就绪设备；onStroke = 发起方的实时笔迹回调 */
  async startSigning(req: { deviceId?: string } | undefined, onStroke: (point: SignStrokePoint) => void): Promise<SignStartResult> {
    try {
      const devices = await this.listDevices()
      const deviceId = req?.deviceId ?? devices.find(d => d.status === 'ready')?.id
      if (!deviceId) {
        throw signatureError('DEVICE_NOT_FOUND', '无可用签名设备')
      }
      const channel = this.channels.get(deviceId.split(':')[0])
      if (!channel) {
        throw signatureError('CHANNEL_UNAVAILABLE', `未知接入方式: ${deviceId.split(':')[0]}`)
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
          device.status === 'unavailable' ? 'CHANNEL_UNAVAILABLE' : 'DEVICE_OFFLINE',
          `签名设备不可用: ${String(device.meta.note ?? device.status)}`,
        )
      }
      // 先挂会话再启动：start 期间到达的首个笔迹点不丢；失败路径回滚
      this.active = { deviceId, onStroke }
      const result = await channel.start(device, p => this.routeStroke(p))
      this.log('info', `签名会话开始 ${deviceId}`)
      return result
    }
    catch (err) {
      this.active = null
      const ce = toSignatureError(err)
      this.log('error', '签名会话启动失败', { code: ce.code, message: ce.message })
      throw ce
    }
  }

  /** 结束会话并回收完整笔迹（无会话抛 SESSION_NOT_ACTIVE） */
  async stopSigning(): Promise<SignSessionResult> {
    const channel = this.activeChannel()
    if (!channel) {
      throw signatureError('SESSION_NOT_ACTIVE', '无进行中的签名会话')
    }
    try {
      const result = await channel.stop()
      this.active = null
      this.log('info', `签名会话结束: ${result.strokeCount} 笔画`)
      return result
    }
    catch (err) {
      this.active = null
      throw toSignatureError(err)
    }
  }

  async clearSignature(): Promise<void> {
    const channel = this.activeChannel()
    if (!channel) {
      throw signatureError('SESSION_NOT_ACTIVE', '无进行中的签名会话')
    }
    await channel.clear()
  }

  async cancelSigning(): Promise<void> {
    const channel = this.activeChannel()
    if (!channel) {
      throw signatureError('SESSION_NOT_ACTIVE', '无进行中的签名会话')
    }
    await channel.cancel()
    this.active = null
    this.log('info', '签名会话取消')
  }

  destroy(): void {
    for (const a of this.channels.values()) { a.destroy?.() }
    this.active = null
  }

  private activeChannel(): SignChannel | null {
    if (!this.active) {
      return null
    }
    return this.channels.get(this.active.deviceId.split(':')[0]) ?? null
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
