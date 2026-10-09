import type { CaptureAdapter, CaptureDevice, CaptureDeviceProfile, CaptureRequest, CaptureResult } from '@desktop/shared'
import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { WebSocket } from 'ws'
import { captureCamSdkBase64 } from './camsdk-session'
import { captureError } from '../errors'

/**
 * WebSocket 本地服务适配器（多协议：点易拍 BaucheSDK 二进制帧 / 华视 CamSDKServer JSON 帧）。
 *
 * 点易拍协议（源自点易拍 SDK Sample/html/js/WsUtil.js，9002 端口）：
 *   帧格式：二进制 = 0xEF + cmd + len + payload；文本 = "GetPicBase64:<base64>" 等回执
 *   开预览：EF 25 05 camId wHi wLo hHi hLo
 *   拍照：  EF 0A 01 00                    → 文本回执 GetPicBase64:<jpg base64>
 *   关预览：EF 08 00
 * 华视 CamSDKServer 协议（9000 端口）见 camsdk-session.ts，由 profile.ws.protocol = 'camsdk' 分发。
 */

interface WsProfileConfig {
  url: string
  protocol?: 'dianyipai' | 'camsdk'
  camId?: number
  width?: number
  height?: number
}

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
  if (!m)
    throw captureError('VALIDATION_FAILED', `无法解析 WebSocket 地址: ${url}`)
  return { host: m[1], port: Number(m[2]) }
}

export class WsAdapter implements CaptureAdapter {
  readonly transport = 'ws' as const

  constructor(private readonly profiles: CaptureDeviceProfile[]) {}

  async listDevices(): Promise<CaptureDevice[]> {
    return Promise.all(
      this.profiles
        .filter(p => p.transport === 'ws' && p.ws)
        .map(async (p) => {
          const { host, port } = parseWsUrl(p.ws!.url)
          const alive = await tcpProbe(host, port)
          // 协议未经验证的档案（verified: false）只探活不采集：声明 ready 会误导上层直接拍照
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

  async capture(req: CaptureRequest, device: CaptureDevice): Promise<CaptureResult> {
    const profile = this.profiles.find(p => `ws:${p.id}` === device.id)
    if (!profile?.ws) {
      throw captureError('DEVICE_NOT_FOUND', `ws 适配器下不存在设备: ${device.id}`)
    }
    // 协议未经验证（verified: false）：服务探活在 listDevices 可见，但绝不套用其他厂商协议采集
    if (profile.ws.verified === false) {
      throw captureError('ADAPTER_UNAVAILABLE', `${profile.brand}设备 ws 协议帧待真机实测（不套用点易拍协议），暂未适配采集`)
    }
    const { host, port } = parseWsUrl(profile.ws.url)
    const alive = await tcpProbe(host, port)
    if (!alive) {
      throw captureError('DEVICE_OFFLINE', `${profile.brand}本地采集服务未运行（${host}:${port}），请确认厂商 SDK 服务端已安装`, {
        url: profile.ws.url,
      })
    }

    const dir = req.saveDir ?? path.join('out', 'capture')
    await mkdir(dir, { recursive: true })
    const file = path.join(dir, `ws-${profile.id}-${Date.now()}.jpg`)

    const base64 = profile.ws.protocol === 'camsdk'
      ? await captureCamSdkBase64(profile.ws)
      : await this.captureBase64(profile.ws)
    await writeFile(file, Buffer.from(base64, 'base64'))
    return {
      ok: true,
      imagePath: file,
      thumbDataUrl: `data:image/jpeg;base64,${base64}`,
      meta: { transport: 'ws', url: profile.ws.url },
    }
  }

  /** 单次采集会话：开预览 → 拍照 → 收 GetPicBase64 → 关预览 */
  private captureBase64(wsCfg: WsProfileConfig): Promise<string> {
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
        if (settled)
          return
        settled = true
        clearTimeout(timer)
        clearTimeout(captureTimer)
        try {
          ws.close()
        }
        catch {
          /* 忽略 */
        }
        if (err)
          reject(err)
        else resolve(base64!)
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
