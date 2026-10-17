import type { AdapterCaptureRequest, CaptureAdapter, CaptureCameraInfo, CaptureDevice, CaptureDeviceConfig, CaptureResult } from '@desktop/shared'
import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { WebSocket } from 'ws'
import { captureError } from '../errors'
import { CamSdkPreviewSession, listCamSdkCameras } from './camsdk-preview'
import { captureCamSdkBase64 } from './camsdk-session'

/**
 * WebSocket 本地服务适配器（多协议：点易拍 BaucheSDK 二进制帧 / 华视 CamSDKServer JSON 帧）。
 *
 * 点易拍协议（源自点易拍 SDK Sample/html/js/WsUtil.js，9002 端口）：
 *   帧格式：二进制 = 0xEF + cmd + len + payload；文本 = "GetPicBase64:<base64>" 等回执
 *   开预览：EF 25 05 camId wHi wLo hHi hLo
 *   拍照：  EF 0A 01 00                    → 文本回执 GetPicBase64:<jpg base64>
 *   关预览：EF 08 00
 * 华视 CamSDKServer 协议（9000 端口）见 camsdk-session.ts，由 config.ws.protocol = 'camsdk' 分发。
 */

interface MiniWS {
  binaryType: string
  send: (data: ArrayBuffer) => void
  close: () => void
  onopen: (() => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  onerror: ((err: unknown) => void) | null
  onclose: (() => void) | null
}

function tcpProbe(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const done = (v: boolean): void => {
      if (!settled) {
        settled = true
        resolve(v)
      }
    }
    import('node:net')
      .then((net) => {
        const socket = net.createConnection({ host, port }, () => {
          socket.destroy()
          done(true)
        })
        socket.setTimeout(timeoutMs)
        socket.on('timeout', () => {
          socket.destroy()
          done(false)
        })
        socket.on('error', () => done(false))
        socket.on('close', () => done(false))
      })
      .catch(() => done(false))
  })
}

function parseWsUrl(url: string): { host: string, port: number } {
  const m = /^ws:\/\/([^:/]+):(\d+)/.exec(url)
  if (!m) { throw captureError('VALIDATION_FAILED', `无法解析 WebSocket 地址: ${url}`) }
  return { host: m[1], port: Number(m[2]) }
}

export class WsAdapter implements CaptureAdapter {
  readonly transport = 'ws' as const

  /** 常驻预览会话（deviceId → 会话）：capture 优先走会话内拍照，配置热重建时统一销毁 */
  private readonly previews = new Map<string, CamSdkPreviewSession>()

  constructor(private readonly configs: CaptureDeviceConfig[]) {}

  async listDevices(): Promise<CaptureDevice[]> {
    return Promise.all(
      this.configs
        .filter(p => p.transport === 'ws' && p.ws)
        .map(async (p) => {
          const { host, port } = parseWsUrl(p.ws!.url)
          const alive = await tcpProbe(host, port)
          // 协议未经验证的配置（verified: false）只探活不采集：声明 ready 会误导上层直接拍照
          const verified = p.ws!.verified !== false
          return {
            id: `ws:${p.id}`,
            displayName: p.displayName,
            brand: p.brand,
            transport: 'ws' as const,
            status: alive ? (verified ? ('ready' as const) : ('unavailable' as const)) : ('offline' as const),
            capabilities: { crop: true, desewarp: true, ...(p.capabilities ?? {}) },
            meta: {
              url: p.ws!.url,
              note: !alive
                ? '本地服务未运行（需安装厂商 SDK 服务端）'
                : verified
                  ? '本地服务运行中'
                  : '服务在线，但该设备 ws 协议帧待真机实测，暂未适配采集',
            },
          }
        }),
    )
  }

  async capture(req: AdapterCaptureRequest, device: CaptureDevice): Promise<CaptureResult> {
    const { config, ws } = this.findConfig(device.id)
    // 协议未经验证（verified: false）：服务探活在 listDevices 可见，但绝不套用其他厂商协议采集
    if (ws.verified === false) {
      throw captureError('ADAPTER_UNAVAILABLE', `${config.brand}设备 ws 协议帧待真机实测（不套用点易拍协议），暂未适配采集`)
    }
    // 预览会话开启时走会话内拍照（摄像头不重开）；否则按协议一次性开采集
    const session = ws.protocol === 'camsdk' ? this.previews.get(device.id) : undefined
    const live = session?.active ?? false
    const base64 = live ? await session!.capture() : await this.captureOnce(req, config, ws)
    const file = await this.saveCaptureBase64(req, config.id, base64)
    return {
      imagePath: file,
      thumbDataUrl: `data:image/jpeg;base64,${base64}`,
      meta: { transport: 'ws', url: ws.url, ...(live ? { via: 'preview' } : {}) },
    }
  }

  /** 一次性采集（无预览会话时）：探活后按协议开摄像头拍照并关闭 */
  private async captureOnce(req: AdapterCaptureRequest, config: CaptureDeviceConfig, ws: NonNullable<CaptureDeviceConfig['ws']>): Promise<string> {
    const { host, port } = parseWsUrl(ws.url)
    const alive = await tcpProbe(host, port)
    if (!alive) {
      throw captureError('DEVICE_OFFLINE', `${config.brand}本地采集服务未运行（${host}:${port}），请确认厂商 SDK 服务端已安装`, {
        url: ws.url,
      })
    }
    return ws.protocol === 'camsdk'
      ? captureCamSdkBase64(ws, req.resolutionNum ?? 0)
      : this.captureBase64(ws)
  }

  private async saveCaptureBase64(req: AdapterCaptureRequest, profileId: string, base64: string): Promise<string> {
    const dir = req.saveDir
    await mkdir(dir, { recursive: true })
    const file = path.join(dir, `ws-${profileId}-${Date.now()}.jpg`)
    await writeFile(file, Buffer.from(base64, 'base64'))
    return file
  }

  // ── 实时预览与摄像头枚举（仅华视 CamSDK 路线支持常驻连接） ──

  startPreview(deviceId: string, onFrame: (base64: string) => void, opts?: { resolutionNum?: number }): Promise<void> {
    return this.previewOp(deviceId, async (ws) => {
      // 重复开启先释放旧会话（换摄像头/分辨率重启走同一路径）
      this.previews.get(deviceId)?.close()
      const session = new CamSdkPreviewSession(ws, opts?.resolutionNum ?? 0, onFrame)
      await session.open()
      this.previews.set(deviceId, session)
    })
  }

  async stopPreview(deviceId: string): Promise<void> {
    this.previews.get(deviceId)?.close()
    this.previews.delete(deviceId)
  }

  async listCameras(deviceId: string): Promise<CaptureCameraInfo[]> {
    return this.previewOp(deviceId, ws => listCamSdkCameras(ws))
  }

  /** 预览/枚举公共壳：定位配置 → 校验 camsdk 协议 → 探活（不通过即抛统一错误） */
  private async previewOp<T>(deviceId: string, fn: (ws: NonNullable<CaptureDeviceConfig['ws']>) => Promise<T>): Promise<T> {
    const { config, ws } = this.findConfig(deviceId)
    if (ws.protocol !== 'camsdk') {
      throw captureError('ADAPTER_UNAVAILABLE', `${config.brand}设备不支持实时预览/摄像头枚举（仅华视 CamSDK 路线）`)
    }
    const { host, port } = parseWsUrl(ws.url)
    if (!await tcpProbe(host, port)) {
      throw captureError('DEVICE_OFFLINE', `${config.brand}本地采集服务未运行（${host}:${port}），请确认厂商 SDK 服务端已安装`, { url: ws.url })
    }
    return fn(ws)
  }

  /** 销毁：关闭全部预览会话（配置热重建/系统停机时防 ws 泄漏） */
  destroy(): void {
    for (const session of this.previews.values()) { session.close() }
    this.previews.clear()
  }

  /** 按 deviceId 定位 ws 设备配置（预览/枚举/采集共用） */
  private findConfig(deviceId: string): { config: CaptureDeviceConfig, ws: NonNullable<CaptureDeviceConfig['ws']> } {
    const config = this.configs.find(p => `ws:${p.id}` === deviceId)
    if (!config?.ws) {
      throw captureError('DEVICE_NOT_FOUND', `ws 适配器下不存在设备: ${deviceId}`)
    }
    return { config, ws: config.ws }
  }

  /** 单次采集会话：开预览 → 拍照 → 收 GetPicBase64 → 关预览 */
  private captureBase64(wsCfg: NonNullable<CaptureDeviceConfig['ws']>): Promise<string> {
    return new Promise((resolve, reject) => {
      const prefix = 'GetPicBase64:'
      const camId = wsCfg.camId ?? 0
      const w = wsCfg.width ?? 1600
      const h = wsCfg.height ?? 1200

      let settled = false
      let timer: ReturnType<typeof setTimeout> | undefined
      /** 拍照指令延迟发送定时器（预览稳定后拍照），会话结束须清理 */
      let captureTimer: ReturnType<typeof setTimeout> | undefined
      const ws = new WebSocket(wsCfg.url) as unknown as MiniWS
      ws.binaryType = 'arraybuffer'

      const done = (err: unknown, base64?: string): void => {
        if (settled) { return }
        settled = true
        clearTimeout(timer)
        clearTimeout(captureTimer)
        try {
          ws.close()
        }
        catch {
          /* 忽略 */
        }
        if (err) { reject(err) }
        else { resolve(base64!) }
      }

      const frame = (cmd: number, payload: number[]): ArrayBuffer => {
        const a = new Uint8Array(2 + payload.length + 1)
        a[0] = 0xEF
        a[1] = cmd
        a[2] = payload.length
        payload.forEach((v, i) => (a[3 + i] = v))
        return a.buffer
      }

      timer = setTimeout(
        () => done(captureError('CAPTURE_FAILED', `采集超时（${wsCfg.url}）`)),
        12000,
      )

      ws.onopen = () => {
        // 开预览（分辨率 1600×1200），预览帧到达后设备才可拍照
        ws.send(frame(0x25, [camId, Math.floor(w / 256), w % 256, Math.floor(h / 256), h % 256]))
        captureTimer = setTimeout(() => ws.send(frame(0x0A, [0x00])), 700)
      }
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string' && ev.data.startsWith(prefix)) {
          done(undefined, ev.data.slice(prefix.length))
        }
        // 二进制 EF 05 预览帧忽略
      }
      ws.onerror = () => done(captureError('DEVICE_OFFLINE', `WebSocket 连接失败: ${wsCfg.url}`))
      ws.onclose = () => done(captureError('DEVICE_OFFLINE', '服务连接在采集完成前关闭'))
    })
  }
}
