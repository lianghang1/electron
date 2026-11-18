/**
 * RGBA 位图原语与几何合成（Java fitToPaper 重绘段的移植）：
 * conflux 用 Graphics2D 在白底 TYPE_INT_RGB 画布上做 BICUBIC 插值重绘，
 * 本层用纯 JS 位图操作等价实现（色通道独立卷积，底色由画布白底保证）。
 */

export interface Bitmap {
  /** RGBA 像素，行主序，长度 = width × height × 4 */
  data: Uint8Array
  width: number
  height: number
}

/** 页面 /Rotate 标记（FPDFPage_GetRotation 返回值）：顺时针步进角度 */
export type PageRotation = 0 | 90 | 180 | 270

/**
 * 顺时针旋转位图。PDFium 的 FPDF_RenderPageBitmap 固定按原始方向渲染（不含 /Rotate），
 * Java PDFBox renderImageWithDPI 会自动转正——此函数补齐该差异，
 * 调用方按页面 /Rotate 值旋转渲染结果。
 */
export function rotateBitmap(src: Bitmap, rotation: PageRotation): Bitmap {
  if (rotation === 0) { return src }
  if (rotation === 180) {
    const data = new Uint8Array(src.data.length)
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const dst = (y * src.width + x) * 4
        const s = ((src.height - 1 - y) * src.width + (src.width - 1 - x)) * 4
        data[dst] = src.data[s]
        data[dst + 1] = src.data[s + 1]
        data[dst + 2] = src.data[s + 2]
        data[dst + 3] = src.data[s + 3]
      }
    }
    return { data, width: src.width, height: src.height }
  }
  // 90/270 转置：newW = oldH、newH = oldW
  const width = src.height
  const height = src.width
  const data = new Uint8Array(src.data.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dst = (y * width + x) * 4
      const s = rotation === 90
        ? ((src.height - 1 - x) * src.width + y) * 4
        : (x * src.width + (src.width - 1 - y)) * 4
      data[dst] = src.data[s]
      data[dst + 1] = src.data[s + 1]
      data[dst + 2] = src.data[s + 2]
      data[dst + 3] = src.data[s + 3]
    }
  }
  return { data, width, height }
}

/**
 * 三次卷积插值核（Keys，a = -0.5）：Java Graphics2D INTERPOLATION_BICUBIC 的核形状。
 * 边界外按边缘像素 clamp（Graphics2D 对越界采样的默认行为）。
 */
function cubicKernel(t: number): number {
  const a = -0.5
  const abs = Math.abs(t)
  if (abs <= 1) {
    return (a + 2) * abs * abs * abs - (a + 3) * abs * abs + 1
  }
  if (abs < 2) {
    return a * abs * abs * abs - 5 * a * abs * abs + 8 * a * abs - 4 * a
  }
  return 0
}

interface AxisMapping {
  /** 每个目标像素的 4 个采样起点（已 clamp 到源边界内）与对应权重 */
  starts: Int32Array
  weights: Float64Array
}

/** 半像素中心对齐的采样映射（Java bicubic 的目标→源坐标换算同式） */
function axisMapping(srcSize: number, dstSize: number): AxisMapping {
  const scale = srcSize / dstSize
  const starts = new Int32Array(dstSize * 4)
  const weights = new Float64Array(dstSize * 4)
  for (let i = 0; i < dstSize; i++) {
    // 目标像素中心 (i + 0.5) 映回源坐标再减半像素，得到采样中心
    const center = (i + 0.5) * scale - 0.5
    const start = Math.floor(center) - 1
    let sum = 0
    for (let k = 0; k < 4; k++) {
      const w = cubicKernel(center - (start + k))
      weights[i * 4 + k] = w
      sum += w
    }
    // 归一化（卷积核在映射端点处权重和可能略偏离 1）
    for (let k = 0; k < 4; k++) {
      weights[i * 4 + k] /= sum
    }
    for (let k = 0; k < 4; k++) {
      starts[i * 4 + k] = Math.min(srcSize - 1, Math.max(0, start + k))
    }
  }
  return { starts, weights }
}

/** RGBA 单像素在行内 4 采样的卷积，结果以浮点写入目标行（第二趟卷积后统一取整） */
function convolveRow(
  srcRow: Uint8Array,
  mapping: AxisMapping,
  dstX: number,
  dstRow: Float64Array,
): void {
  let r = 0
  let g = 0
  let b = 0
  let a = 0
  const base = dstX * 4
  for (let k = 0; k < 4; k++) {
    const w = mapping.weights[dstX * 4 + k]
    const s = mapping.starts[dstX * 4 + k] * 4
    r += srcRow[s] * w
    g += srcRow[s + 1] * w
    b += srcRow[s + 2] * w
    a += srcRow[s + 3] * w
  }
  dstRow[base] = r
  dstRow[base + 1] = g
  dstRow[base + 2] = b
  dstRow[base + 3] = a
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

/**
 * BICUBIC 缩放（可分离两趟：横向 → 纵向），对齐 Java fitContain 重绘的
 * INTERPOLATION_BICUBIC。输出写回 Uint8（舍入）。
 */
export function resizeBitmap(src: Bitmap, dstW: number, dstH: number): Bitmap {
  if (dstW === src.width && dstH === src.height) {
    return { data: new Uint8Array(src.data), width: dstW, height: dstH }
  }
  const mid = axisMapping(src.width, dstW)
  const vertical = axisMapping(src.height, dstH)
  // 第一趟：每源行卷积出目标宽度行（暂存浮点，第二趟卷积后统一取整）
  const midData = new Float64Array(dstW * src.height * 4)
  const row = new Float64Array(dstW * 4)
  for (let y = 0; y < src.height; y++) {
    row.fill(0)
    const srcRow = src.data.subarray(y * src.width * 4, (y + 1) * src.width * 4)
    for (let x = 0; x < dstW; x++) {
      convolveRow(srcRow, mid, x, row)
    }
    midData.set(row, y * dstW * 4)
  }
  // 第二趟：纵向卷积（列方向同型映射）+ 取整
  const data = new Uint8Array(dstW * dstH * 4)
  const col = new Float64Array(4)
  for (let y = 0; y < dstH; y++) {
    const base = y * dstW * 4
    for (let x = 0; x < dstW; x++) {
      col[0] = 0
      col[1] = 0
      col[2] = 0
      col[3] = 0
      for (let k = 0; k < 4; k++) {
        const srcY = vertical.starts[y * 4 + k]
        const w = vertical.weights[y * 4 + k]
        const s = (srcY * dstW + x) * 4
        col[0] += midData[s] * w
        col[1] += midData[s + 1] * w
        col[2] += midData[s + 2] * w
        col[3] += midData[s + 3] * w
      }
      const d = base + x * 4
      data[d] = clampByte(Math.round(col[0]))
      data[d + 1] = clampByte(Math.round(col[1]))
      data[d + 2] = clampByte(Math.round(col[2]))
      data[d + 3] = clampByte(Math.round(col[3]))
    }
  }
  return { data, width: dstW, height: dstH }
}

/**
 * 白底画布合成（Java fitToPaper 的 TYPE_INT_RGB 白底 + drawImage 段）：
 * drawRect 尺寸与源图一致时直接贴放（无重采样开销），否则 BICUBIC 缩放后贴放。
 */
export function composeOnCanvas(src: Bitmap, drawW: number, drawH: number, x: number, y: number, canvasW: number, canvasH: number): Bitmap {
  const data = new Uint8Array(canvasW * canvasH * 4)
  data.fill(255)
  const resized = drawW === src.width && drawH === src.height
    ? src
    : resizeBitmap(src, drawW, drawH)
  for (let row = 0; row < drawH; row++) {
    const d = ((y + row) * canvasW + x) * 4
    const s = row * drawW * 4
    data.set(resized.data.subarray(s, s + drawW * 4), d)
  }
  return { data, width: canvasW, height: canvasH }
}
