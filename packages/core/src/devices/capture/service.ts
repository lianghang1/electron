import type { CaptureAdapter, CaptureDevice, CaptureDeviceProfile, CaptureErrorCode, CaptureLogFn, CaptureRequest, CaptureResult } from '@desktop/shared'
import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DllAdapter } from './adapters/dll-adapter'
import { ServiceAdapter } from './adapters/service-adapter'
import { StubAdapter } from './adapters/stub-adapter'
import { WiaAdapter } from './adapters/wia-adapter'
import { WsAdapter } from './adapters/ws-adapter'
import { captureError, toCaptureError } from './errors'
import { BUILT_IN_CAPTURE_PROFILES } from './profiles'

export interface CaptureServiceOptions {
  /** 设备资源根（DLL 相对路径基准，宿主解析开发/打包差异） */
  resourcesRoot: string
  /** 注册 stub 模拟采集设备（无硬件联调/演示用）；缺省不注册，正式环境零模拟 */
  mock?: boolean
  /** 初始设备档案（持久化回注；不传 = 出厂档案） */
  initialProfiles?: CaptureDeviceProfile[]
  /** 运行时编辑持久化（未注入则编辑仅内存生效） */
  persist?: (profiles: CaptureDeviceProfile[]) => void
  /** 结构化日志注入（采集日志不含图片内容） */
  logger?: CaptureLogFn
  /** 采集图片默认保存目录（绝对路径） */
  defaultSaveDir: string
}

/**
 * CaptureService = 统一采集 API 的实现体（与 PrintService 同构的归一化层）。
 * 多品牌 × 多接入方式：品牌差异在设备档案（数据），接入方式差异在适配器（代码）。
 * 设备档案支持运行时编辑（upsertProfile → persist → 热重建适配器），
 * 适配"服务地址/IP/端口变更"场景。UVC 路线在渲染进程（getUserMedia），不经本服务。
 */
export class CaptureService {
  private profiles: CaptureDeviceProfile[]
  private adapters: Map<string, CaptureAdapter>
  /** 同一设备串行化采集（硬件一次一格） */
  private locks = new Map<string, Promise<unknown>>()
  private readonly logger: CaptureLogFn
  /** 采集图片默认保存目录（绝对路径） */
  private readonly defaultSaveDir: string
  private readonly persist?: (profiles: CaptureDeviceProfile[]) => void
  private readonly resourcesRoot: string
  /** stub 模拟设备注册开关（显式配置驱动，缺省关闭） */
  private readonly useStub: boolean

  constructor(options: CaptureServiceOptions) {
    this.logger = options.logger ?? (() => {})
    this.defaultSaveDir = path.resolve(options.defaultSaveDir)
    this.persist = options.persist
    this.resourcesRoot = options.resourcesRoot
    this.useStub = options.mock ?? false
    this.profiles = options.initialProfiles ?? BUILT_IN_CAPTURE_PROFILES
    this.adapters = this.buildAdapters()
  }

  private buildAdapters(): Map<string, CaptureAdapter> {
    const adapters: [string, CaptureAdapter][] = [
      ['service', new ServiceAdapter(this.profiles)],
      ['wia', new WiaAdapter()],
      ['dll', new DllAdapter(this.profiles, this.resourcesRoot)],
      ['ws', new WsAdapter(this.profiles)],
    ]
    // stub 模拟设备仅在显式开启时注册（不进正式设备列表）
    if (this.useStub) {
      adapters.unshift(['stub', new StubAdapter()])
    }
    return new Map<string, CaptureAdapter>(adapters)
  }

  /** 运行时编辑设备档案：upsert 一条 → 持久化 → 热重建适配器（地址/端口变更即时生效） */
  upsertProfile(profile: CaptureDeviceProfile): void {
    if (!profile?.id || !profile.transport) {
      throw toCaptureError(captureError('VALIDATION_FAILED', '设备档案缺少 id 或 transport'))
    }
    const list = this.profiles.slice()
    const i = list.findIndex(p => p.id === profile.id)
    if (i >= 0)
      list[i] = profile
    else list.push(profile)
    this.profiles = list
    this.persist?.(list)
    this.adapters = this.buildAdapters()
  }

  getProfiles(): CaptureDeviceProfile[] {
    return this.profiles.slice()
  }

  /** 设备列表：各适配器上报后按 transport 合并 */
  async listDevices(): Promise<CaptureDevice[]> {
    const groups = await Promise.all([...this.adapters.values()].map(a => a.listDevices().catch(() => [])))
    return groups.flat()
  }

  /** 采集：路由到设备所属适配器执行；同一设备串行化（硬件一次一格） */
  async capture(req: CaptureRequest): Promise<CaptureResult> {
    try {
      if (!req?.deviceId) {
        return fail('VALIDATION_FAILED', '缺少 deviceId')
      }
      const transport = req.deviceId.split(':')[0]
      const adapter = this.adapters.get(transport)
      if (!adapter) {
        return fail('ADAPTER_UNAVAILABLE', `未知接入方式: ${transport}`)
      }
      const devices = await adapter.listDevices()
      const device = devices.find(d => d.id === req.deviceId)
      if (!device)
        return fail('DEVICE_NOT_FOUND', `未找到设备: ${req.deviceId}`)
      if (device.status === 'offline')
        return fail('DEVICE_OFFLINE', `设备离线: ${device.displayName}`)
      if (device.status === 'unavailable') {
        return fail('ADAPTER_UNAVAILABLE', `设备适配器不可用: ${String(device.meta.note ?? transport)}`)
      }
      const prev = this.locks.get(req.deviceId) ?? Promise.resolve()
      // 调用方未指定保存目录时注入模块默认目录（绝对路径）
      const reqWithDir: CaptureRequest = { ...req, saveDir: req.saveDir ?? this.defaultSaveDir }
      // 链上已 catch，永不 reject，单分支即可
      const task = prev.then(() => adapter.capture(reqWithDir, device))
      this.locks.set(req.deviceId, task.catch(() => undefined))
      this.log('info', `开始采集 ${device.displayName}`, { deviceId: device.id, transport })
      const result = await task
      this.log(result.ok ? 'info' : 'warn', `采集完成 ${device.displayName}: ${result.ok ? '成功' : result.error?.code}`, {
        deviceId: device.id,
      })
      return result
    }
    catch (err) {
      const ce = toCaptureError(err)
      this.log('error', `采集异常 ${req.deviceId}: ${ce.message}`)
      return fail(ce.code, ce.message, ce.detail)
    }
  }

  destroy(): void {
    for (const a of this.adapters.values()) a.destroy?.()
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

function fail(code: CaptureErrorCode, message: string, detail?: unknown): CaptureResult {
  return { ok: false, error: { code, message, detail } }
}
