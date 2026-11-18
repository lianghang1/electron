import type { EncodedPage } from '../../../src/domains/print/rasterize/engine.ts'
import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { assertRasterizeConfig } from '../../../src/domains/print/rasterize/contract.ts'
import { createPdfiumLibrary, rasterizePdf } from '../../../src/domains/print/rasterize/engine.ts'

/**
 * pdfium 真渲染集成测试（Node 22 + strip-types 直跑，纯 WASM 无平台依赖）。
 * 断言锚定 conflux 行为：多页页序不变、页面尺寸按渲染像素反算、
 * /Rotate 自动转正、paper 纸型重建。
 */

async function makeTestPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  // A4 竖（595.28 × 841.89 pt）
  const p1 = doc.addPage([595.28, 841.89])
  p1.drawText('P1', { x: 50, y: 700, font, size: 24, color: rgb(0, 0, 0) })
  // A4 横（841.89 × 595.28 pt）
  const p2 = doc.addPage([841.89, 595.28])
  p2.drawText('P2', { x: 50, y: 500, font, size: 24, color: rgb(0, 0, 0) })
  // A4 横内容 + /Rotate 90：显示转正为竖（Java 渲染输出竖向位图）
  const p3 = doc.addPage([841.89, 595.28])
  p3.drawText('P3', { x: 50, y: 500, font, size: 24, color: rgb(0, 0, 0) })
  p3.setRotation(degrees(90))
  return doc.save()
}

const A4_PT_W = 595.28
const A4_PT_H = 841.89
// 反算容差：pdfium 输出像素为 floor(floor(pt) × scale)（pt 先取整再乘 scale），
// 渲染像素比源尺寸少 ≤2px；Java PDFBox 用 round 误差略小，反算页尺寸偏差 ≤~1.5pt，算法语义一致
const TOLERANCE_PT = 2

describe('rasterizePdf（pdfium 真渲染）', () => {
  it('模式一（无 paper）：页数与页序不变，页面尺寸与源一致（含横页）', async () => {
    const library = await createPdfiumLibrary()
    try {
      const pages = await rasterizePdf(library, await makeTestPdf(), assertRasterizeConfig({ dpi: 150 }))
      assert.equal(pages.length, 3)
      assert.ok(Math.abs(pages[0].wpt - A4_PT_W) < TOLERANCE_PT && Math.abs(pages[0].hpt - A4_PT_H) < TOLERANCE_PT)
      assert.ok(Math.abs(pages[1].wpt - A4_PT_H) < TOLERANCE_PT && Math.abs(pages[1].hpt - A4_PT_W) < TOLERANCE_PT)
    }
    finally {
      library.destroy()
    }
  })

  it('/Rotate 90 页自动转正：渲染输出为竖向（PDFBox 语义）', async () => {
    const library = await createPdfiumLibrary()
    try {
      const pages = await rasterizePdf(library, await makeTestPdf(), assertRasterizeConfig({ dpi: 150 }))
      const p3 = pages[2]
      assert.ok(p3.wpt < p3.hpt, `转正后应为竖向页，实际 ${p3.wpt} x ${p3.hpt}`)
      assert.ok(Math.abs(p3.wpt - A4_PT_W) < TOLERANCE_PT && Math.abs(p3.hpt - A4_PT_H) < TOLERANCE_PT)
    }
    finally {
      library.destroy()
    }
  })

  it('paper 重建纸型：所有页统一为 A5 纵向（模式二）', async () => {
    const library = await createPdfiumLibrary()
    try {
      const pages = await rasterizePdf(library, await makeTestPdf(), assertRasterizeConfig({ dpi: 150, paper: { widthMm: 148, heightMm: 210 } }))
      // 148mm @150dpi = round(874.0) = 874px → 419.52pt；210mm → round(1240.16) = 1240px → 595.2pt
      for (const page of pages) {
        assert.ok(Math.abs(page.wpt - 419.52) < TOLERANCE_PT, `A5 宽实际 ${page.wpt}`)
        assert.ok(Math.abs(page.hpt - 595.2) < TOLERANCE_PT, `A5 高实际 ${page.hpt}`)
        assert.ok(page.wpt < page.hpt)
      }
    }
    finally {
      library.destroy()
    }
  })

  it('PNG 输出带 PNG 签名', async () => {
    const library = await createPdfiumLibrary()
    try {
      const pages = await rasterizePdf(library, await makeTestPdf(), assertRasterizeConfig({ dpi: 72 }))
      assert.deepEqual([...pages[0].data.slice(0, 8)], [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    }
    finally {
      library.destroy()
    }
  })

  it('JPEG 输出带 JFIF 签名（0xFFD8 开头）', async () => {
    const library = await createPdfiumLibrary()
    try {
      const pages: EncodedPage[] = await rasterizePdf(library, await makeTestPdf(), assertRasterizeConfig({ dpi: 72, outputFormat: 'jpeg', jpegQuality: 0.9 }))
      assert.equal(pages[0].data[0], 0xFF)
      assert.equal(pages[0].data[1], 0xD8)
    }
    finally {
      library.destroy()
    }
  })

  it('auto 方向按页宽高比判向：横页用横向画布', async () => {
    const library = await createPdfiumLibrary()
    try {
      const pages = await rasterizePdf(library, await makeTestPdf(), assertRasterizeConfig({ dpi: 150, paper: { widthMm: 210, heightMm: 297 }, orientation: 'auto' }))
      // 第 2 页为横内容：auto → 横向画布 297x210mm
      assert.ok(pages[1].wpt > pages[1].hpt, `横页应保持横向画布，实际 ${pages[1].wpt} x ${pages[1].hpt}`)
      // 第 1 页为竖内容：auto → 纵向画布
      assert.ok(pages[0].wpt < pages[0].hpt)
    }
    finally {
      library.destroy()
    }
  })

  it('非 PDF 输入直接拒绝', async () => {
    const library = await createPdfiumLibrary()
    try {
      await assert.rejects(
        () => rasterizePdf(library, new TextEncoder().encode('<html>hello</html>'), assertRasterizeConfig({})),
        /未找到 %PDF- 文件头/,
      )
    }
    finally {
      library.destroy()
    }
  })
})

describe('assemblePdf（repaper）', () => {
  it('逐页 addPage：页数、尺寸与 drawImage 铺满', async () => {
    const library = await createPdfiumLibrary()
    try {
      const pages = await rasterizePdf(library, await makeTestPdf(), assertRasterizeConfig({ dpi: 150 }))
      const { assemblePdf } = await import('../../../src/domains/print/rasterize/repaper.ts')
      const pdf = await assemblePdf(pages)
      const doc = await PDFDocument.load(pdf)
      assert.equal(doc.getPageCount(), 3)
      const p0 = doc.getPage(0)
      assert.ok(Math.abs(p0.getWidth() - pages[0].wpt) < 0.01)
      assert.ok(Math.abs(p0.getHeight() - pages[0].hpt) < 0.01)
      // 端到端验证 drawImage：重渲染组装后的 PDF，原页应含内容（drawImage 未执行则为纯白）
      const out = await library.loadDocument(pdf)
      try {
        const rendered = await out.getPage(0).render({ scale: 0.2, colorSpace: 'RGBA' })
        let nonWhite = 0
        for (let i = 0; i < rendered.data.length; i += 4) {
          if (rendered.data[i] < 250) { nonWhite++ }
        }
        assert.ok(nonWhite > 0, `组装后页面应含贴放图像，非白像素 ${nonWhite}`)
      }
      finally {
        out.destroy()
      }
      assert.ok(pdf.length > 1000)
    }
    finally {
      library.destroy()
    }
  })
})
