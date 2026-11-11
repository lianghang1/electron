import type { CaptureCameraInfo, CaptureChannel, CaptureDevice, CaptureDeviceConfig, CaptureResult, ChannelCaptureRequest } from '@shell/shared'
import type { CapturePreviewSession } from '../vendors/vendor-contracts'
import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseWsUrl, tcpProbe } from '../../../kernel/channel/ws-channel'
import { captureError } from '../errors'
import { diagnoseCamSdkService, ensureCamSdkService } from '../vendors/camsdk-service'
import { getCaptureVendor } from '../vendors/registry'

/**
 * WebSocket 本地服务通道（厂商协议已模块化，本类只做路由与落盘）：
 * 帧编解码与会话语义在 vendors/（camsdk=CamSDKServer JSON 帧、dianyipai=点易拍 BaucheSDK 二进制帧），
 * 由 config.ws.protocol 分发（缺省 dianyipai）。
 */
export class WsChannel implements CaptureChannel {
  readonly transport = 'ws' as const

  /** 常驻预览会话（deviceId → 会话）：capture 优先走会话内拍照，配置热重建时统一销毁 */
  private readonly previews = new Map<string, CapturePreviewSession>()

  constructor(private readonly configs: CaptureDeviceConfig[]) {}

  async listDevices(): Promise<CaptureDevice[]> {
    return Promise.all(
      this.configs
        .filter(p => p.transport === 'ws' && p.ws)
        .map(async (p) => {
          const { host, port } = parseWsUrl(p.ws!.url)
          let alive = await tcpProbe(host, port)
          // 探活失败先尝试自动拉起厂商服务（camsdk 发现式自愈），仍不通再走离线提示
          if (!alive && p.ws!.protocol === 'camsdk') {
            alive = await ensureCamSdkService({ url: p.ws!.url, brand: p.brand, command: p.ws!.wake?.command })
          }
          // 协议未经验证的配置（verified: false）只探活不采集：声明 ready 会误导上层直接拍照
          const verified = p.ws!.verified !== false
          const status = await this.assessStatus(p.ws!, { alive, verified, brand: p.brand })
          return {
            id: `ws:${p.id}`,
            displayName: p.displayName,
            brand: p.brand,
            transport: 'ws' as const,
            status: status.value,
            capabilities: { crop: true, desewarp: true, ...(p.capabilities ?? {}) },
            meta: {
              url: p.ws!.url,
              note: status.note,
            },
          }
        }),
    )
  }

  /**
   * 设备状态判定（ready 收紧：探活通过 ≠ 设备在位）：
   * - 服务不通 → offline（含 camsdk 自愈失败的四态诊断）；
   * - 协议未验证/未知协议 → unavailable（不伪装可用）；
   * - 服务在线且厂商支持摄像头枚举 → 枚举 ≥1 台真机才 ready，0 台 = 设备未接（unavailable）；
   *   枚举异常（会话占用等暂态）退回探活级 ready，不惩罚；
   * - 厂商未实现枚举（如 dianyipai）→ 维持探活级 ready，能力缺失不惩罚。
   */
  private async assessStatus(
    ws: NonNullable<CaptureDeviceConfig['ws']>,
    ctx: { alive: boolean, verified: boolean, brand: string },
  ): Promise<{ value: 'ready' | 'offline' | 'unavailable', note: string }> {
    if (!ctx.alive) {
      return { value: 'offline', note: await this.offlineNote(ctx.brand, ws) }
    }
    if (!ctx.verified) {
      return { value: 'unavailable', note: '服务在线，但该设备 ws 协议帧待真机实测，暂未接入采集' }
    }
    const vendor = getCaptureVendor(ws.protocol)
    if (!vendor) {
      return { value: 'unavailable', note: `配置了未知的 ws 协议: ${String(ws.protocol)}` }
    }
    if (!vendor.listCameras) {
      return { value: 'ready', note: '本地服务运行中' }
    }
    try {
      const cameras = await vendor.listCameras(ws)
      if (cameras.length > 0) {
        return { value: 'ready', note: `本地服务运行中（${cameras.length} 台摄像头在位）` }
      }
      return { value: 'unavailable', note: '服务在线，但未检测到拍摄设备（确认高拍仪已连接并开机）' }
    }
    catch {
      return { value: 'ready', note: '本地服务运行中（摄像头枚举失败，在位状态未知）' }
    }
  }

  async capture(req: ChannelCaptureRequest, device: CaptureDevice): Promise<CaptureResult> {
    const { config, ws } = this.findConfig(device.id)
    // 协议未经验证（verified: false）：服务探活在 listDevices 可见，但绝不套用其他厂商协议采集
    if (ws.verified === false) {
      throw captureError('CHANNEL_UNAVAILABLE', `${config.brand}设备 ws 协议帧待真机实测（不套用点易拍协议），暂未接入采集`)
    }
    // 预览会话开启时走会话内拍照（摄像头不重开）；否则按厂商协议一次性开采集
    const session = this.previews.get(device.id)
    const live = session?.active ?? false
    const base64 = live ? await session!.capture() : await this.vendorOf(config, ws).captureOnce(ws, req)
    const file = await this.saveCaptureBase64(req, config.id, base64)
    return {
      imagePath: file,
      thumbDataUrl: `data:image/jpeg;base64,${base64}`,
      meta: { transport: 'ws', url: ws.url, ...(live ? { via: 'preview' } : {}) },
    }
  }

  // ── 实时预览与摄像头枚举（仅实现了对应可选能力的厂商支持） ──

  startPreview(deviceId: string, onFrame: (base64: string) => void, opts?: { resolutionNum?: number }): Promise<void> {
    return this.previewOp(deviceId, async (vendor, ws) => {
      // 重复开启先释放旧会话（换摄像头/分辨率重启走同一路径）
      this.previews.get(deviceId)?.close()
      const session = vendor.createPreviewSession!(ws, opts ?? {}, onFrame)
      await session.open()
      this.previews.set(deviceId, session)
    })
  }

  async stopPreview(deviceId: string): Promise<void> {
    this.previews.get(deviceId)?.close()
    this.previews.delete(deviceId)
  }

  async listCameras(deviceId: string): Promise<CaptureCameraInfo[]> {
    return this.previewOp(deviceId, (vendor, ws) => vendor.listCameras!(ws))
  }

  /** 销毁：关闭全部预览会话（配置热重建/系统停机时防 ws 泄漏） */
  destroy(): void {
    for (const session of this.previews.values()) {
      session.close()
    }
    this.previews.clear()
  }

  /** 预览/枚举公共壳：定位配置 → 定位厂商并校验可选能力 → 探活（不通过即抛统一错误） */
  private async previewOp<T>(deviceId: string, fn: (vendor: NonNullable<ReturnType<typeof getCaptureVendor>>, ws: NonNullable<CaptureDeviceConfig['ws']>) => Promise<T>): Promise<T> {
    const { config, ws } = this.findConfig(deviceId)
    const vendor = this.vendorOf(config, ws)
    if (!vendor.createPreviewSession || !vendor.listCameras) {
      throw captureError('CHANNEL_UNAVAILABLE', `${config.brand}设备不支持实时预览/摄像头枚举`)
    }
    const { host, port } = parseWsUrl(ws.url)
    let reachable = await tcpProbe(host, port)
    if (!reachable && ws.protocol === 'camsdk') {
      reachable = await ensureCamSdkService({ url: ws.url, brand: config.brand, command: ws.wake?.command })
    }
    if (!reachable) {
      throw captureError('DEVICE_OFFLINE', await this.offlineNote(config.brand, ws), { url: ws.url })
    }
    return fn(vendor, ws)
  }

  /** 按配置 protocol 定位厂商模块（未知协议显式报错，不静默回落） */
  private vendorOf(config: CaptureDeviceConfig, ws: NonNullable<CaptureDeviceConfig['ws']>): NonNullable<ReturnType<typeof getCaptureVendor>> {
    const vendor = getCaptureVendor(ws.protocol)
    if (!vendor) {
      throw captureError('CHANNEL_UNAVAILABLE', `${config.brand}设备配置了未知的 ws 协议: ${String(ws.protocol)}`)
    }
    return vendor
  }

  /** 自动拉起失败后的离线提示：camsdk 协议附带发现式四态诊断，诊断不可用回落默认文案 */
  private async offlineNote(brand: string, ws: NonNullable<CaptureDeviceConfig['ws']>): Promise<string> {
    if (ws.protocol === 'camsdk') {
      const diagnosed = await diagnoseCamSdkService({ url: ws.url, brand, command: ws.wake?.command })
      if (diagnosed) {
        return diagnosed
      }
    }
    return '本地服务未运行（需安装厂商 SDK 服务端）'
  }

  private async saveCaptureBase64(req: ChannelCaptureRequest, profileId: string, base64: string): Promise<string> {
    const dir = req.saveDir
    await mkdir(dir, { recursive: true })
    const file = path.join(dir, `ws-${profileId}-${Date.now()}.jpg`)
    await writeFile(file, Buffer.from(base64, 'base64'))
    return file
  }

  /** 按 deviceId 定位 ws 设备配置（预览/枚举/采集共用） */
  private findConfig(deviceId: string): { config: CaptureDeviceConfig, ws: NonNullable<CaptureDeviceConfig['ws']> } {
    const config = this.configs.find(p => `ws:${p.id}` === deviceId)
    if (!config?.ws) {
      throw captureError('DEVICE_NOT_FOUND', `ws 通道下不存在设备: ${deviceId}`)
    }
    return { config, ws: config.ws }
  }
}
