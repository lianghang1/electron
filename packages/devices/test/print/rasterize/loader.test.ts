import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { assertPdfMagic, checkRenderSize } from '../../../src/domains/print/rasterize/loader.ts'

describe('assertPdfMagic（Java loadPdf 魔数校验）', () => {
  it('%PDF- 开头放行', () => {
    assertPdfMagic(new TextEncoder().encode('%PDF-1.7\n%âãÏÓ'))
  })

  it('Java 只查前 4 字节且长度 ≥ 5：%PDFX（第 5 字节无关）放行', () => {
    assertPdfMagic(new TextEncoder().encode('%PDFX'))
  })

  it('非 PDF 内容拒绝，错误带大小与 16 字节预览', () => {
    const body = new TextEncoder().encode('<html>not a pdf at all...</html>')
    assert.throws(() => assertPdfMagic(body), (err: Error & { code?: string }) => {
      assert.equal(err.code, 'VALIDATION_FAILED')
      assert.match(err.message, /未找到 %PDF- 文件头（大小 32 字节，开头: <html>not a pdf/)
      return true
    })
  })

  it('不足 5 字节拒绝（Java length >= 5）', () => {
    assert.throws(() => assertPdfMagic(new TextEncoder().encode('%PDF')), /未找到 %PDF- 文件头（大小 4 字节/)
  })

  it('预览中非可打印 ASCII 字符替换为 "."', () => {
    const body = new TextEncoder().encode('%PD\x00\x01\x02')
    assert.throws(() => assertPdfMagic(body), /开头: %PD\.\.\./)
  })
})

describe('checkRenderSize（Java 单页位图内存上限）', () => {
  it('常规页放行（letter 8.5x11pt @1200dpi ≈ 0.1MB）', () => {
    checkRenderSize(612, 792, 1200, 0)
  })

  it('超大页高 DPI 抛 RENDER_FAILED，消息带页码与尺寸', () => {
    // 4752pt = 19800px @300dpi（整除无浮点毛刺）→ 19800²×4 ≈ 1495.5MB > 1024MB
    assert.throws(() => checkRenderSize(4752, 4752, 300, 0), (err: Error & { code?: string }) => {
      assert.equal(err.code, 'RENDER_FAILED')
      assert.match(err.message, /第 1 页渲染内存超限：页面 4752 x 4752 pt @ 300 DPI 约需 1496 MB 位图（单页上限 1024 MB）/)
      return true
    })
  })

  it('页码从 0 计数，错误消息从 1 起展示', () => {
    assert.throws(() => checkRenderSize(4800, 4800, 300, 2), /第 3 页渲染内存超限/)
  })
})
