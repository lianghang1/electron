import type { CaptureAdapter, CaptureDevice, CaptureDeviceProfile, CaptureRequest, CaptureResult } from '@desktop/shared'
import { Buffer } from 'node:buffer'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { captureError } from '../errors'

/**
 * 厂商本地 HTTP 服务适配器（点易拍/良田新款等：设备驱动在本机起 HTTP/WS 服务）。
 * 品牌差异全部在设备档案里声明（baseUrl/路径/图片字段），适配器本身零品牌代码。
 */
export class ServiceAdapter implements CaptureAdapter {
  readonly transport = 'service' as const

  constructor(private readonly profiles: CaptureDeviceProfile[]) {}

  private byId(id: string): CaptureDeviceProfile {
    const found = this.profiles.find(p => `service:${p.id}` === id)
    if (!found || found.transport !== 'service' || !found.service) {
      throw captureError('DEVICE_NOT_FOUND', `service 适配器下不存在设备: ${id}`)
    }
    return found
  }

  async listDevices(): Promise<CaptureDevice[]> {
    return Promise.all(
      this.profiles
        .filter(p => p.transport === 'service' && p.service)
        .map(async p => ({
          id: `service:${p.id}`,
          displayName: p.displayName,
          brand: p.brand,
          transport: 'service' as const,
          status: (await this.probe(p.service!.baseUrl)) ? ('ready' as const) : ('offline' as const),
          capabilities: { crop: true, desewarp: true, ...(p.capabilities ?? {}) },
          meta: { baseUrl: p.service!.baseUrl },
        })),
    )
  }

  /** 服务探活：GET baseUrl，2s 超时 */
  private async probe(baseUrl: string): Promise<boolean> {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 2000)
      await fetch(baseUrl, { signal: ctrl.signal })
      clearTimeout(t)
      return true // 只要连上（哪怕 404）就算服务活着
    }
    catch {
      return false
    }
  }

  async capture(req: CaptureRequest, device: CaptureDevice): Promise<CaptureResult> {
    const profile = this.byId(device.id)
    const svc = profile.service!
    const url = `${svc.baseUrl.replace(/\/$/, '')}${svc.capturePath}`
    let res: Response
    try {
      res = await fetch(url, {
        method: svc.method ?? 'POST',
        headers: { 'Content-Type': 'application/json', ...(svc.extraHeaders ?? {}) },
        body: svc.method === 'POST' ? JSON.stringify({ deviceId: profile.id, format: req.format ?? 'jpg' }) : undefined,
      })
    }
    catch (err) {
      throw captureError('DEVICE_OFFLINE', `厂商服务请求失败: ${String(err)}`, { url })
    }
    if (!res.ok) {
      throw captureError('CAPTURE_FAILED', `厂商服务返回 ${res.status}`, { url })
    }

    const dir = req.saveDir ?? path.join('out', 'capture')
    await mkdir(dir, { recursive: true })
    const file = path.join(dir, `service-${profile.id}-${Date.now()}.${req.format ?? 'jpg'}`)

    if (!svc.imageField || svc.imageField === 'raw') {
      // 响应体即图片字节
      const buf = Buffer.from(await res.arrayBuffer())
      await writeFile(file, buf)
    }
    else {
      const json = (await res.json()) as Record<string, unknown>
      const raw = json[svc.imageField ?? 'data']
      if (typeof raw !== 'string') {
        throw captureError('CAPTURE_FAILED', `响应缺少图片字段 ${svc.imageField}`, { keys: Object.keys(json) })
      }
      const base64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw
      await writeFile(file, Buffer.from(base64, 'base64'))
    }

    const saved = await readFile(file)
    return {
      imagePath: file,
      thumbDataUrl: `data:image/${req.format ?? 'jpg'};base64,${saved.toString('base64')}`,
      meta: { transport: 'service', brand: profile.brand, url },
    }
  }
}
