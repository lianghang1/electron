import type { Bitmap } from './bitmap'
import type { RasterizeConfig, RasterizeOutputFormat } from './contract'
import { PDFiumLibrary } from '@hyzyla/pdfium/inline'
import { composeOnCanvas } from './bitmap'
import { encodeJpg, encodePng } from './encode'
import { computeCanvasLayout, computeDrawRect } from './geometry'
import { assertPdfMagic, checkRenderSize } from './loader'

/**
 * PDFium 渲染编排：conflux renderAllPages（逐页 checkRenderSize → 渲染 → fitToPaper）
 * 与 rasterize 组装段（渲染像素反算页面尺寸）的移植。
 */

export interface EncodedPage {
  /** 页面尺寸（pt）：按最终位图像素反算（px × 72 / DPI，Java L455-456 同式） */
  wpt: number
  hpt: number
  format: RasterizeOutputFormat
  data: Uint8Array
}

/** inline 版（wasm 内联进 bundle）满足 asar 自包含契约；进程内共享一个实例 */
export function createPdfiumLibrary(): Promise<PDFiumLibrary> {
  return PDFiumLibrary.init({ disableBase64Warning: true })
}

export async function rasterizePdf(library: PDFiumLibrary, bytes: Uint8Array, config: RasterizeConfig): Promise<EncodedPage[]> {
  assertPdfMagic(bytes)
  const doc = await library.loadDocument(bytes)
  try {
    const scale = config.dpi / 72
    const pages: EncodedPage[] = []
    for (let i = 0; i < doc.getPageCount(); i++) {
      // pdfium 的 getOriginalSize 返回转正后尺寸（/Rotate 已应用），转正只交换宽高，
      // checkRenderSize 的 pxW×pxH 乘积与 Java 基于 CropBox 的口径一致
      const page = doc.getPage(i)
      const { originalWidth: wpt, originalHeight: hpt } = page.getOriginalSize()
      checkRenderSize(wpt, hpt, config.dpi, i)
      const rendered = await page.render({ scale, colorSpace: 'RGBA' })
      let bitmap: Bitmap = { data: rendered.data, width: rendered.width, height: rendered.height }
      // pdfium 渲染已自动应用页面 /Rotate（FPDF_RenderPageBitmap 语义），与 PDFBox
      // renderImageWithDPI 自动转正行为一致，无需补转正
      if (config.paper != null) {
        const layout = computeCanvasLayout(config.paper, bitmap.width, bitmap.height, {
          orientation: config.orientation,
          alignment: config.alignment,
          marginMM: config.marginMM,
          contentWidthMM: config.contentWidthMM,
          contentHeightMM: config.contentHeightMM,
          dpi: config.dpi,
        })
        const rect = computeDrawRect(bitmap.width, bitmap.height, layout, config.alignment, config.contentStretch)
        if (rect) {
          bitmap = composeOnCanvas(bitmap, rect.drawW, rect.drawH, rect.x, rect.y, layout.canvasW, layout.canvasH)
        }
      }
      pages.push({
        wpt: bitmap.width * 72 / config.dpi,
        hpt: bitmap.height * 72 / config.dpi,
        format: config.outputFormat,
        data: config.outputFormat === 'jpeg' ? encodeJpg(bitmap, config.jpegQuality) : encodePng(bitmap),
      })
    }
    return pages
  }
  finally {
    doc.destroy()
  }
}
