import type { PaperSpec } from '@shell/shared'
import type { RasterizeAlignment, RasterizeOrientation } from './contract'
import { printError } from '../errors'

/**
 * conflux PdfImageConverter 几何计算 1:1 移植：fitToPaper 的画布与内容区域、
 * fitContain 的绘制矩形。所有取整与 Java 一致（正数域 Math.round ≈ (int) Math.round、
 * 差值非负时 Math.floor ≈ Java int 除法截断），位图重采样由引擎层按本层输出的矩形执行。
 */

/** 目标画布尺寸 + 内容可用区域（Java fitToPaper L539-577 输出） */
export interface CanvasLayout {
  canvasW: number
  canvasH: number
  regionX: number
  regionY: number
  regionW: number
  regionH: number
}

/** 内容绘制矩形（Java fitContain L595-618 输出） */
export interface DrawRect {
  drawW: number
  drawH: number
  x: number
  y: number
}

export interface CanvasLayoutParams {
  orientation: RasterizeOrientation
  alignment: RasterizeAlignment
  marginMM: number
  contentWidthMM: number
  contentHeightMM: number
  dpi: number
}

export function mmToPx(mm: number, dpi: number): number {
  return Math.round(mm / 25.4 * dpi)
}

/**
 * 目标画布尺寸与内容区域（Java fitToPaper）：等比缩放放进纸型画布，内容水平居中、
 * 垂直按 alignment 对齐；设置 contentWidthMM/contentHeightMM 时区域改为指定内容尺寸
 * （再内缩 marginMM）。marginMM 过大 / 内容尺寸超画布是纯配置错误，与页面内容无关。
 */
export function computeCanvasLayout(paper: PaperSpec, pageW: number, pageH: number, params: CanvasLayoutParams): CanvasLayout {
  const { orientation, alignment, marginMM, contentWidthMM, contentHeightMM, dpi } = params
  // conflux PaperSize 枚举按竖放记录短边/长边；PaperSpec 允许任意宽高写法，取 min/max 归一为竖放语义
  const shortSide = Math.min(paper.widthMm, paper.heightMm)
  const longSide = Math.max(paper.widthMm, paper.heightMm)
  const landscape = orientation === 'landscape' || (orientation === 'auto' && pageW >= pageH)
  const canvasWMM = landscape ? longSide : shortSide
  const canvasHMM = landscape ? shortSide : longSide
  const canvasW = mmToPx(canvasWMM, dpi)
  const canvasH = mmToPx(canvasHMM, dpi)
  const marginPx = mmToPx(marginMM, dpi)

  let regionX: number
  let regionY: number
  let regionW: number
  let regionH: number
  if (contentWidthMM > 0 && contentHeightMM > 0) {
    regionW = mmToPx(contentWidthMM, dpi) - 2 * marginPx
    regionH = mmToPx(contentHeightMM, dpi) - 2 * marginPx
    if (regionW <= 0 || regionH <= 0) {
      throw printError('VALIDATION_FAILED', `marginMM 过大：内容尺寸 ${contentWidthMM} x ${contentHeightMM}mm 内放不下 ${marginMM}mm 的边距`)
    }
    if (regionW > canvasW || regionH > canvasH) {
      throw printError('VALIDATION_FAILED', `内容尺寸 ${contentWidthMM} x ${contentHeightMM}mm 超过目标纸型 ${paper.widthMm}x${paper.heightMm}mm（画布 ${canvasWMM} x ${canvasHMM}mm），无法放入`)
    }
    regionX = Math.floor((canvasW - regionW) / 2)
    switch (alignment) {
      case 'top': regionY = marginPx; break
      case 'bottom': regionY = canvasH - marginPx - regionH; break
      default: regionY = Math.floor((canvasH - regionH) / 2)
    }
  }
  else {
    regionW = canvasW - 2 * marginPx
    regionH = canvasH - 2 * marginPx
    if (regionW <= 0 || regionH <= 0) {
      throw printError('VALIDATION_FAILED', `marginMM 过大：目标纸型 ${paper.widthMm}x${paper.heightMm}mm（画布 ${canvasWMM} x ${canvasHMM}mm）内放不下 ${marginMM}mm 的边距`)
    }
    regionX = marginPx
    regionY = marginPx
  }
  return { canvasW, canvasH, regionX, regionY, regionW, regionH }
}

/**
 * 内容绘制矩形（Java fitContain）：stretch=true 宽高独立缩放铺满区域（允许变形，alignment 不生效）；
 * stretch=false 等比缩放、水平居中、垂直按 alignment 对齐，空白处由引擎层铺白底。
 * 返回 undefined = Java 快速路径（区域即整个画布且页面尺寸与画布完全一致）：直接用原位图，不重绘。
 */
export function computeDrawRect(pageW: number, pageH: number, layout: CanvasLayout, alignment: RasterizeAlignment, stretch: boolean): DrawRect | undefined {
  if (layout.regionX === 0 && layout.regionY === 0
    && layout.regionW === layout.canvasW && layout.regionH === layout.canvasH
    && pageW === layout.canvasW && pageH === layout.canvasH) {
    return undefined
  }
  if (stretch) {
    return { drawW: layout.regionW, drawH: layout.regionH, x: layout.regionX, y: layout.regionY }
  }
  const scale = Math.min(layout.regionW / pageW, layout.regionH / pageH)
  const drawW = Math.max(1, Math.round(pageW * scale))
  const drawH = Math.max(1, Math.round(pageH * scale))
  const x = layout.regionX + Math.floor((layout.regionW - drawW) / 2)
  let y: number
  switch (alignment) {
    case 'top': y = layout.regionY; break
    case 'bottom': y = layout.regionY + layout.regionH - drawH; break
    default: y = layout.regionY + Math.floor((layout.regionH - drawH) / 2)
  }
  return { drawW, drawH, x, y }
}
