import type { Bitmap } from './bitmap'
import { Buffer } from 'node:buffer'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'

/**
 * 位图 → 图像字节（Java JPEGFactory 有损 / LosslessFactory 无损的对应物）。
 * 输出仅作为 PDF 页面图像（repaper 铺满页面），Java 侧的 pHYs/JFIF DPI 元数据
 * 写入逻辑与 PDF 打印无关，不移植。
 */

/** RGBA 视图转 Buffer（同 ArrayBuffer 零拷贝） */
function asBuffer(b: Bitmap): Buffer {
  return Buffer.from(b.data.buffer, b.data.byteOffset, b.data.byteLength)
}

export function encodePng(b: Bitmap): Uint8Array {
  const png = new PNG({ width: b.width, height: b.height })
  png.data = asBuffer(b)
  return PNG.sync.write(png)
}

/** jpeg-js quality 为 0-100 整数，Java jpegQuality 0-1 → ×100 */
export function encodeJpg(b: Bitmap, quality: number): Uint8Array {
  return jpeg.encode({ data: asBuffer(b), width: b.width, height: b.height }, Math.round(quality * 100)).data
}
