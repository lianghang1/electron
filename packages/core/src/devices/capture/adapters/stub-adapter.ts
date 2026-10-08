import type { CaptureAdapter, CaptureDevice, CaptureRequest, CaptureResult } from '@desktop/shared'
import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { captureError } from '../errors'

/** 生成 24bpp BMP（无压缩，无需任何依赖） */
function makeBmp(width: number, height: number, draw: (x: number, y: number) => [number, number, number]): Buffer {
  const rowSize = Math.ceil((width * 3) / 4) * 4
  const pixels = Buffer.alloc(rowSize * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = draw(x, y)
      const off = (height - 1 - y) * rowSize + x * 3 // BMP 自底向上
      pixels[off] = b
      pixels[off + 1] = g
      pixels[off + 2] = r
    }
  }
  const header = Buffer.alloc(54)
  header.write('BM', 0)
  header.writeUInt32LE(54 + pixels.length, 2)
  header.writeUInt32LE(54, 10)
  header.writeUInt32LE(40, 14)
  header.writeInt32LE(width, 18)
  header.writeInt32LE(height, 22)
  header.writeUInt16LE(1, 26)
  header.writeUInt16LE(24, 28)
  header.writeUInt32LE(pixels.length, 34)
  return Buffer.concat([header, pixels])
}

/** stub 适配器：无硬件全链路验证用——生成一张"模拟文档"图片（白底+边框+灰线+黑块） */
export class StubAdapter implements CaptureAdapter {
  readonly transport = 'stub' as const

  async listDevices(): Promise<CaptureDevice[]> {
    return [
      {
        id: 'stub:scanner',
        displayName: '模拟采集设备（stub）',
        brand: '内置',
        transport: 'stub',
        status: 'ready',
        capabilities: { crop: true, desewarp: true },
        meta: { note: '生成模拟文档图片，用于无硬件验证采集→打印全链路' },
      },
    ]
  }

  async capture(req: CaptureRequest, device: CaptureDevice): Promise<CaptureResult> {
    if (device.id !== 'stub:scanner') {
      throw captureError('DEVICE_NOT_FOUND', `stub 适配器只有 stub:scanner 设备`, { deviceId: req.deviceId })
    }
    const w = 640
    const h = 480
    const bmp = makeBmp(w, h, (x, y) => {
      const border = x < 6 || y < 6 || x >= w - 6 || y >= h - 6
      if (border)
        return [40, 44, 54]
      if (y > 60 && y < 68 && x > 30 && x < w - 30)
        return [120, 124, 136] // 模拟标题行
      if (y > 90 && y < 96 && x > 30 && x < w - 60)
        return [180, 184, 192]
      if (y > 120 && y < 126 && x > 30 && x < w - 90)
        return [180, 184, 192]
      if (x > w - 140 && y > h - 160 && x < w - 30 && y < h - 30)
        return [30, 32, 40] // 模拟黑块（章/条码区）
      const grid = (x + y) % 48 === 0
      return grid ? [225, 228, 234] : [252, 252, 253]
    })

    const dir = req.saveDir ?? path.join('out', 'capture')
    await mkdir(dir, { recursive: true })
    const file = path.join(dir, `stub-${Date.now()}.bmp`)
    await writeFile(file, bmp)
    return {
      ok: true,
      imagePath: file,
      thumbDataUrl: `data:image/bmp;base64,${bmp.toString('base64')}`,
      meta: { transport: 'stub', width: w, height: h },
    }
  }
}
