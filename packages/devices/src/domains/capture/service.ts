import type { CaptureCameraInfo, CaptureChannel, CaptureDevice, CaptureDeviceConfig, CaptureDeviceOverrides, CaptureLogFn, CaptureRequest, CaptureResult, ChannelCaptureRequest } from '@shell/shared'
import type { DeviceHost } from '../../host/device-host'
import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DllChannel } from './channels/dll-channel'
import { ServiceChannel } from './channels/service-channel'
import { WiaChannel } from './channels/wia-channel'
import { WsChannel } from './channels/ws-channel'
import { BUILT_IN_CAPTURE_CONFIGS } from './configs'
import { captureError, toCaptureError } from './errors'

export interface CaptureServiceOptions {
  /** 设备资源根（DLL 相对路径基准，宿主解析开发/打包差异） */
  resourcesRoot: string
  /** 设备守护进程（DLL 探测的 koffi 调用崩溃隔离在 host 进程） */
  host: DeviceHost
  /** 现场白名单覆盖（历史持久化回注；不传 = 出厂档案原样） */
  initialOverrides?: CaptureDeviceOverrides[]
  /** 运行时编辑持久化（白名单覆盖形状；未注入则编辑仅内存生效） */
  persist?: (overrides: CaptureDeviceOverrides[]) => void
  /** 结构化日志注入（采集日志不含图片内容） */
  logger?: CaptureLogFn
  /** 采集图片默认保存目录（绝对路径） */
  defaultSaveDir: string
  /** 域默认设备 id 持久化读（未注入 = 无默认设备能力，自动定位仅回落第一个就绪设备） */
  getDefaultDeviceId?: () => string | undefined
  /** 域默认设备 id 持久化写（undefined = 清除） */
  setDefaultDeviceId?: (id: string | undefined) => void
}

/** 档案 → 白名单覆盖（持久化只写现场可调字段，技术字段永远随代码出厂） */
function overridesOf(p: CaptureDeviceConfig): CaptureDeviceOverrides {
  return {
    id: p.id,
    displayName: p.displayName,
    ...(p.ws
      ? {
          ws: {
            url: p.ws.url,
            camId: p.ws.camId,
            width: p.ws.width,
            height: p.ws.height,
            ...(p.ws.wake ? { wake: { command: p.ws.wake.command } } : {}),
          },
        }
      : {}),
    ...(p.service
      ? { service: { baseUrl: p.service.baseUrl, listPath: p.service.listPath, capturePath: p.service.capturePath } }
      : {}),
  }
}

/** 白名单字段就地覆盖（仅非空字段生效；历史整条持久化按同名字段读取，旧 dll 段等自然忽略） */
function applyOverrides(profile: CaptureDeviceConfig, s: CaptureDeviceOverrides): void {
  if (typeof s.displayName === 'string' && s.displayName.trim()) {
    profile.displayName = s.displayName
  }
  if (profile.ws && s.ws) {
    if (typeof s.ws.url === 'string' && s.ws.url.trim()) {
      profile.ws.url = s.ws.url
    }
    if (typeof s.ws.camId === 'number' && s.ws.camId >= 0) {
      profile.ws.camId = s.ws.camId
    }
    if (typeof s.ws.width === 'number' && s.ws.width > 0) {
      profile.ws.width = s.ws.width
    }
    if (typeof s.ws.height === 'number' && s.ws.height > 0) {
      profile.ws.height = s.ws.height
    }
    // wake 段提交即整体重设：空命令 = 清除拉起命令（回落发现式策略）
    if (s.ws.wake !== undefined) {
      const command = typeof s.ws.wake.command === 'string' ? s.ws.wake.command.trim() : ''
      profile.ws.wake = command ? { command } : undefined
    }
  }
  if (profile.service && s.service) {
    if (typeof s.service.baseUrl === 'string' && s.service.baseUrl.trim()) {
      profile.service.baseUrl = s.service.baseUrl
    }
    if (typeof s.service.listPath === 'string' && s.service.listPath.trim()) {
      profile.service.listPath = s.service.listPath
    }
    if (typeof s.service.capturePath === 'string' && s.service.capturePath.trim()) {
      profile.service.capturePath = s.service.capturePath
    }
  }
}

/**
 * 历史持久化合并 + 白名单提取：以出厂整条为基准，stored 同 id 仅提取白名单字段
 * （名称/连接参数）覆盖——代码修改任何技术字段（品牌/协议/能力/DLL）立即生效，
 * 本地旧数据不再整体压住出厂值。清单完全由代码预设决定。
 */
function migrateCaptureConfigs(overrides?: CaptureDeviceOverrides[]): CaptureDeviceConfig[] {
  const stored = Array.isArray(overrides) ? overrides : []
  return BUILT_IN_CAPTURE_CONFIGS.map((b) => {
    const profile = structuredClone(b)
    const s = stored.find(x => x.id === b.id)
    if (s) {
      applyOverrides(profile, s)
    }
    return profile
  })
}

/**
 * CaptureService = 统一采集 API 的实现体（与 PrintService 同构的归一化层）。
 * 多品牌 × 多接入方式：品牌差异在设备配置（数据），接入方式差异在通道（代码）。
 * 设备配置支持运行时编辑（setConfig → persist → 热重建通道），
 * 接入"服务地址/IP/端口变更"场景。UVC 路线在渲染进程（getUserMedia），不经本服务。
 */
export class CaptureService {
  private configs: CaptureDeviceConfig[]
  private channels: Map<string, CaptureChannel>
  /** 同一设备串行化采集（硬件一次一格） */
  private locks = new Map<string, Promise<unknown>>()
  private readonly logger: CaptureLogFn
  /** 采集图片默认保存目录（绝对路径） */
  private readonly defaultSaveDir: string
  private readonly persist?: (overrides: CaptureDeviceOverrides[]) => void
  private readonly getDefaultDeviceId?: () => string | undefined
  private readonly setDefaultDeviceId?: (id: string | undefined) => void
  private readonly resourcesRoot: string
  private readonly host: DeviceHost

  constructor(options: CaptureServiceOptions) {
    this.logger = options.logger ?? (() => {})
    this.defaultSaveDir = path.resolve(options.defaultSaveDir)
    this.persist = options.persist
    this.getDefaultDeviceId = options.getDefaultDeviceId
    this.setDefaultDeviceId = options.setDefaultDeviceId
    this.resourcesRoot = options.resourcesRoot
    this.host = options.host
    this.configs = migrateCaptureConfigs(options.initialOverrides)
    this.channels = this.buildChannels()
  }

  private buildChannels(): Map<string, CaptureChannel> {
    // 热重建前销毁旧通道持有的资源（ws 预览会话等），防连接泄漏；构造首调时 channels 尚未初始化
    for (const a of this.channels?.values() ?? []) { a.destroy?.() }
    const channels: [string, CaptureChannel][] = [
      ['service', new ServiceChannel(this.configs)],
      ['wia', new WiaChannel()],
      ['dll', new DllChannel(this.host, this.configs, this.resourcesRoot)],
      ['ws', new WsChannel(this.configs)],
    ]
    return new Map<string, CaptureChannel>(channels)
  }

  /** 运行时现场白名单覆盖：档案 id 必须为出厂预设项；覆盖 → 持久化白名单 → 热重建通道 */
  setConfig(id: string, overrides: CaptureDeviceOverrides): void {
    if (!this.configs.some(p => p.id === id)) {
      throw captureError('VALIDATION_FAILED', `设备档案不存在: ${id}`)
    }
    const list = this.configs.map((p) => {
      if (p.id !== id) {
        return p
      }
      const next = structuredClone(p)
      applyOverrides(next, overrides)
      return next
    })
    this.configs = list
    this.persist?.(list.map(overridesOf))
    this.channels = this.buildChannels()
  }

  getConfigs(): CaptureDeviceConfig[] {
    return this.configs.slice()
  }

  /** 读取域默认设备 id（未配置返回 undefined） */
  getDefaultDevice(): string | undefined {
    return this.getDefaultDeviceId?.()
  }

  /** 设置域默认设备（undefined = 清除；id 惰性校验——不存在的 id 在定位时自然回落） */
  setDefaultDevice(id: string | undefined): void {
    const normalized = typeof id === 'string' && id.trim() ? id.trim() : undefined
    this.setDefaultDeviceId?.(normalized)
  }

  /**
   * 默认设备解析：配置的默认设备且处于就绪状态才返回其 id，否则 undefined
   * （调用方回落「第一个就绪设备」或自选）。探测异常静默回落，不影响调用链。
   */
  async resolveDefaultDevice(): Promise<string | undefined> {
    const preferred = this.getDefaultDeviceId?.()
    if (!preferred) {
      return undefined
    }
    try {
      const device = (await this.listDevices()).find(d => d.id === preferred)
      return device?.status === 'ready' ? preferred : undefined
    }
    catch {
      return undefined
    }
  }

  /** 设备列表：各通道上报后按 transport 合并 */
  async listDevices(): Promise<CaptureDevice[]> {
    const groups = await Promise.all([...this.channels.values()].map(a => a.listDevices().catch(() => [])))
    return groups.flat()
  }

  /**
   * 实时预览：路由到设备所属通道（仅支持常驻连接的通道，如 ws/camsdk）。
   * onFrame 回调持续收到预览帧（JPEG base64），由 IPC 层转发给发起窗口。失败抛 CaptureError。
   */
  async startPreview(deviceId: string, onFrame: (base64: string) => void, opts?: { resolutionNum?: number }): Promise<void> {
    try {
      const channel = this.previewChannel(deviceId)
      await channel.startPreview(deviceId, onFrame, opts)
    }
    catch (err) {
      const ce = toCaptureError(err)
      this.log('warn', `开启预览失败 ${deviceId}: ${ce.message}`)
      throw ce
    }
  }

  async stopPreview(deviceId: string): Promise<void> {
    const channel = this.previewChannel(deviceId)
    await channel.stopPreview(deviceId)
  }

  /** 枚举设备下的摄像头与分辨率（ws/camsdk GetCameraInfo，不占用摄像头） */
  async listCameras(deviceId: string): Promise<CaptureCameraInfo[]> {
    const channel = this.previewChannel(deviceId)
    return channel.listCameras!(deviceId)
  }

  /** 预览/枚举能力路由：按 transport 找通道并校验可选能力已实现 */
  private previewChannel(deviceId: string): CaptureChannel & Required<Pick<CaptureChannel, 'startPreview' | 'stopPreview' | 'listCameras'>> {
    const transport = deviceId.split(':')[0]
    const channel = this.channels.get(transport)
    if (!channel?.startPreview || !channel.stopPreview || !channel.listCameras) {
      throw captureError('CHANNEL_UNAVAILABLE', `设备 ${deviceId} 不支持实时预览/摄像头枚举`)
    }
    return channel as CaptureChannel & Required<Pick<CaptureChannel, 'startPreview' | 'stopPreview' | 'listCameras'>>
  }

  /** 采集：路由到设备所属通道执行；同一设备串行化（硬件一次一格）。失败抛 CaptureError */
  async capture(req: CaptureRequest): Promise<CaptureResult> {
    try {
      // 显式 deviceId 优先；缺省按域默认设备自动定位（就绪才生效），仍无则显式报错
      const deviceId = req?.deviceId || await this.resolveDefaultDevice()
      if (!deviceId) {
        throw captureError('VALIDATION_FAILED', '缺少 deviceId 且无就绪的默认设备')
      }
      const transport = deviceId.split(':')[0]
      const channel = this.channels.get(transport)
      if (!channel) {
        throw captureError('CHANNEL_UNAVAILABLE', `未知接入方式: ${transport}`)
      }
      const devices = await channel.listDevices()
      const device = devices.find(d => d.id === deviceId)
      if (!device) {
        throw captureError('DEVICE_NOT_FOUND', `未找到设备: ${deviceId}`)
      }
      if (device.status === 'offline') {
        throw captureError('DEVICE_OFFLINE', `设备离线: ${device.displayName}`)
      }
      if (device.status === 'unavailable') {
        throw captureError('CHANNEL_UNAVAILABLE', `设备通道不可用: ${String(device.meta.note ?? transport)}`)
      }
      const prev = this.locks.get(deviceId) ?? Promise.resolve()
      // 保存目录是平台内部事务：恒注入统一根目录 files/capture/，渲染层不可指定（防任意路径写文件）
      const reqWithDir: ChannelCaptureRequest = { ...req, deviceId, saveDir: this.defaultSaveDir }
      // 链上已 catch（登记锁不吞结果），单分支即可
      const task = prev.then(() => channel.capture(reqWithDir, device))
      this.locks.set(deviceId, task.catch(() => undefined))
      this.log('info', `开始采集 ${device.displayName}`, { deviceId: device.id, transport })
      const result = await task
      this.log('info', `采集完成 ${device.displayName}`, { deviceId: device.id })
      return result
    }
    catch (err) {
      const ce = toCaptureError(err)
      this.log('error', `采集异常 ${req?.deviceId ?? ''}: ${ce.message}`, { code: ce.code })
      throw ce
    }
  }

  destroy(): void {
    for (const a of this.channels.values()) { a.destroy?.() }
  }

  private log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void {
    this.logger(level, `[capture] ${message}`, meta)
  }

  /** UVC 路线落盘：渲染层 getUserMedia 拍到的 dataURL → 图片文件（返回绝对路径，供 showItemInFolder 等使用） */
  async saveDataUrl(dataUrl: string, ext: 'jpg' | 'png' = 'jpg'): Promise<string> {
    const m = /^data:image\/(?:png|jpeg);base64,(.+)$/.exec(dataUrl)
    if (!m) {
      throw captureError('VALIDATION_FAILED', 'dataURL 格式不合法（应为 image/png 或 image/jpeg base64）')
    }
    await mkdir(this.defaultSaveDir, { recursive: true })
    const file = path.join(this.defaultSaveDir, `uvc-${Date.now()}.${ext}`)
    await writeFile(file, Buffer.from(m[1], 'base64'))
    return file
  }
}
