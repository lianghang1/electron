import type { EncodedPage } from './engine'
import { PDFDocument } from 'pdf-lib'

/**
 * 页面图像 → 新 PDF（Java rasterize 组装段：逐页 addPage + drawImage 铺满）。
 * 页数与顺序与源文档一致；页面尺寸在 engine 侧已按渲染像素反算。
 */
export async function assemblePdf(pages: EncodedPage[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (const page of pages) {
    const pdfPage = doc.addPage([page.wpt, page.hpt])
    const image = page.format === 'jpeg'
      ? await doc.embedJpg(page.data)
      : await doc.embedPng(page.data)
    pdfPage.drawImage(image, { x: 0, y: 0, width: page.wpt, height: page.hpt })
  }
  // 关闭对象流（PDF 1.5 特性）：PDFBox 默认输出经典结构，老打印机驱动解析兼容性最好
  return doc.save({ useObjectStreams: false })
}
