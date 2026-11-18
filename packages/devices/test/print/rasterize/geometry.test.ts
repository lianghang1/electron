import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { computeCanvasLayout, computeDrawRect, mmToPx } from '../../../src/domains/print/rasterize/geometry.ts'

// dpi=254 时 px = mm × 10（mm / 25.4 × 254），全部断言可手算复核
const DPI = 254
const A4 = { widthMm: 210, heightMm: 297 }

function layout(partial: Partial<Parameters<typeof computeCanvasLayout>[3]>): ReturnType<typeof computeCanvasLayout> {
  return computeCanvasLayout(A4, 2100, 2970, {
    orientation: 'portrait',
    alignment: 'center',
    marginMM: 0,
    contentWidthMM: 0,
    contentHeightMM: 0,
    dpi: DPI,
    ...partial,
  })
}

describe('mmToPx', () => {
  it('四舍五入取整', () => {
    assert.equal(mmToPx(210, 254), 2100)
    // 297 / 25.4 × 300 = 3507.87 → 3508
    assert.equal(mmToPx(297, 300), 3508)
    assert.equal(mmToPx(0.1, 254), 1)
  })
})

describe('computeCanvasLayout（Java fitToPaper）', () => {
  it('A4 纵向画布：210x297mm @254dpi → 2100x2970px，margin 0 时区域即画布', () => {
    assert.deepEqual(layout({}), { canvasW: 2100, canvasH: 2970, regionX: 0, regionY: 0, regionW: 2100, regionH: 2970 })
  })

  it('A4 横向画布：297x210mm', () => {
    assert.deepEqual(layout({ orientation: 'landscape' }), { canvasW: 2970, canvasH: 2100, regionX: 0, regionY: 0, regionW: 2970, regionH: 2100 })
  })

  it('auto 按页面比例判向：横页横向、竖页纵向、正方形页按横向（>=）', () => {
    assert.deepEqual(layout({ orientation: 'auto', dpi: 254 }).canvasW, 2100) // 页 2100x2970 竖 → 画布 2100 宽
    const landscapePage = computeCanvasLayout(A4, 3000, 1500, { orientation: 'auto', alignment: 'center', marginMM: 0, contentWidthMM: 0, contentHeightMM: 0, dpi: DPI })
    assert.equal(landscapePage.canvasW, 2970)
    const squarePage = computeCanvasLayout(A4, 2000, 2000, { orientation: 'auto', alignment: 'center', marginMM: 0, contentWidthMM: 0, contentHeightMM: 0, dpi: DPI })
    assert.equal(squarePage.canvasW, 2970)
  })

  it('marginMM 内缩内容区域（10mm @254 = 100px）', () => {
    assert.deepEqual(layout({ marginMM: 10 }), { canvasW: 2100, canvasH: 2970, regionX: 100, regionY: 100, regionW: 1900, regionH: 2770 })
  })

  it('指定内容尺寸：区域 = content - 2×margin，水平居中、垂直 center', () => {
    // content 210x148.5mm @254 = 2100x1485px，margin 100px → 区域 1900x1285
    // regionX = (2100-1900)/2 = 100；regionY = (2970-1285)/2 整数截断 = 842
    assert.deepEqual(
      layout({ marginMM: 10, contentWidthMM: 210, contentHeightMM: 148.5 }),
      { canvasW: 2100, canvasH: 2970, regionX: 100, regionY: 842, regionW: 1900, regionH: 1285 },
    )
  })

  it('指定内容尺寸垂直对齐：top = margin；bottom = canvasH - margin - regionH', () => {
    const top = layout({ marginMM: 10, contentWidthMM: 210, contentHeightMM: 148.5, alignment: 'top' })
    assert.equal(top.regionY, 100)
    const bottom = layout({ marginMM: 10, contentWidthMM: 210, contentHeightMM: 148.5, alignment: 'bottom' })
    assert.equal(bottom.regionY, 2970 - 100 - 1285)
  })

  it('marginMM 过大（画布放不下边距）抛 VALIDATION_FAILED', () => {
    // 110mm @254 = 1100px > 画布半宽
    assert.throws(() => layout({ marginMM: 110 }), (err: Error & { code?: string }) => {
      assert.equal(err.code, 'VALIDATION_FAILED')
      assert.match(err.message, /marginMM 过大/)
      return true
    })
  })

  it('内容尺寸超画布抛 VALIDATION_FAILED', () => {
    assert.throws(
      () => layout({ contentWidthMM: 300, contentHeightMM: 200 }),
      (err: Error & { code?: string }) => {
        assert.equal(err.code, 'VALIDATION_FAILED')
        assert.match(err.message, /超过目标纸型/)
        return true
      },
    )
  })

  it('marginMM 过大（内容尺寸内放不下边距）抛 VALIDATION_FAILED', () => {
    // content 21x14.85mm = 210x148.5px，margin 100px：regionH = 148.5 - 200 < 0
    assert.throws(() => layout({ marginMM: 10, contentWidthMM: 21, contentHeightMM: 14.85 }), /marginMM 过大：内容尺寸/)
  })
})

describe('computeDrawRect（Java fitContain）', () => {
  const region = { canvasW: 2100, canvasH: 2970, regionX: 100, regionY: 100, regionW: 1900, regionH: 2770 }

  it('快速路径：区域即整个画布且页面与画布一致 → 原图直出', () => {
    const full = { canvasW: 2100, canvasH: 2970, regionX: 0, regionY: 0, regionW: 2100, regionH: 2970 }
    assert.equal(computeDrawRect(2100, 2970, full, 'center', false), undefined)
    assert.notEqual(computeDrawRect(2101, 2970, full, 'center', false), undefined)
  })

  it('等比缩放取宽比小值；水平居中、垂直 center', () => {
    // 页 3000x2000 → scale = min(1900/3000, 2770/2000) = 0.6333 → drawW=1900 drawH=1267
    // x = 100；y = 100 + (2770-1267)/2 整数截断 = 100 + 751 = 851
    assert.deepEqual(computeDrawRect(3000, 2000, region, 'center', false), { drawW: 1900, drawH: 1267, x: 100, y: 851 })
  })

  it('等比缩放垂直对齐：top / bottom', () => {
    const rect = computeDrawRect(3000, 2000, region, 'top', false)
    assert.equal(rect?.y, 100)
    const bottom = computeDrawRect(3000, 2000, region, 'bottom', false)
    assert.equal(bottom?.y, 100 + 2770 - 1267)
  })

  it('小页放大（fitToPaper 语义：内容尽量铺满区域，不设不放大上限）', () => {
    // 页 500x500 → scale = min(1900/500, 2770/500) = 3.8 → drawW=drawH=1900
    assert.deepEqual(computeDrawRect(500, 500, region, 'center', false), { drawW: 1900, drawH: 1900, x: 100, y: 100 + Math.floor((2770 - 1900) / 2) })
  })

  it('stretch 宽高独立缩放铺满区域，alignment 不生效', () => {
    assert.deepEqual(computeDrawRect(3000, 2000, region, 'top', true), { drawW: 1900, drawH: 2770, x: 100, y: 100 })
  })

  it('等比缩放水平居中的整数截断：drawW=909 时偏移取 495（非 496）', () => {
    // 页 2100x2970 进区域 1900x1285：scale = 1285/2970 → drawW = round(2100×1285/2970) = 909
    // (1900-909)/2 = 495.5 → Java int 截断 495
    const content = { canvasW: 2100, canvasH: 2970, regionX: 100, regionY: 842, regionW: 1900, regionH: 1285 }
    assert.deepEqual(computeDrawRect(2100, 2970, content, 'center', false), { drawW: 909, drawH: 1285, x: 595, y: 842 })
  })
})
