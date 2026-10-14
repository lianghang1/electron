import { describe, expect, it } from 'vitest'
import {
  assertPaperSupported,
  paperToPdfPageSize,
  paperToPrintPageSize,
  resolvePaper,
} from './paper'

describe('resolvePaper（字符串便捷写法 → 物理尺寸）', () => {
  it('标准名大小写不敏感（含首尾空白）', () => {
    expect(resolvePaper('a4')).toEqual({ widthMm: 210, heightMm: 297 })
    expect(resolvePaper('A5')).toEqual({ widthMm: 148, heightMm: 210 })
    expect(resolvePaper(' b5 ')).toEqual({ widthMm: 176, heightMm: 250 })
    expect(resolvePaper('Letter')).toEqual({ widthMm: 216, heightMm: 279 })
    expect(resolvePaper('LEGAL')).toEqual({ widthMm: 216, heightMm: 356 })
    expect(resolvePaper('tabloid')).toEqual({ widthMm: 279, heightMm: 432 })
  })

  it('a0–a10/b0–b10 序号纸按 ISO 216 对折递推', () => {
    expect(resolvePaper('A3')).toEqual({ widthMm: 297, heightMm: 420 })
    expect(resolvePaper('a6')).toEqual({ widthMm: 105, heightMm: 148 })
    expect(resolvePaper('b4')).toEqual({ widthMm: 250, heightMm: 353 })
    expect(resolvePaper('a0')).toEqual({ widthMm: 841, heightMm: 1189 })
    // 递推结果与既有惯用值一致
    expect(resolvePaper('a4')).toEqual({ widthMm: 210, heightMm: 297 })
    expect(resolvePaper('b5')).toEqual({ widthMm: 176, heightMm: 250 })
  })

  it('行业通称小票纸 → 宽 × 0（连续纸）', () => {
    expect(resolvePaper('receipt58')).toEqual({ widthMm: 58, heightMm: 0 })
    expect(resolvePaper('Receipt80')).toEqual({ widthMm: 80, heightMm: 0 })
  })

  it('纯数字宽 → 连续纸', () => {
    expect(resolvePaper('80')).toEqual({ widthMm: 80, heightMm: 0 })
  })

  it('宽×高写法（分隔符 x/X/×/*）', () => {
    expect(resolvePaper('80x60')).toEqual({ widthMm: 80, heightMm: 60 })
    expect(resolvePaper('40X30')).toEqual({ widthMm: 40, heightMm: 30 })
    expect(resolvePaper('100×150')).toEqual({ widthMm: 100, heightMm: 150 })
    expect(resolvePaper('76*80')).toEqual({ widthMm: 76, heightMm: 80 })
  })

  it('零宽/无法识别的写法 → undefined（不报错，交打印机驱动默认纸张）', () => {
    expect(resolvePaper('0')).toBeUndefined()
    expect(resolvePaper('0x60')).toBeUndefined()
    expect(resolvePaper(' nonsense ')).toBeUndefined()
    expect(resolvePaper('North America 8x 10')).toBeUndefined()
  })
})

describe('paperToPrintPageSize（webContents.print 静默路径）', () => {
  it('固定纸张 → 微米对象', () => {
    expect(paperToPrintPageSize({ widthMm: 210, heightMm: 297 })).toEqual({ width: 210000, height: 297000 })
    expect(paperToPrintPageSize({ widthMm: 40, heightMm: 30 })).toEqual({ width: 40000, height: 30000 })
  })

  it('连续纸 → undefined，省略 pageSize 交给驱动', () => {
    // Electron 37 要求对象 pageSize 的 width/height 均为正数，height:0 会报
    // "height and width properties are required for pageSize" —— 静默打印回归关键
    expect(paperToPrintPageSize({ widthMm: 58, heightMm: 0 })).toBeUndefined()
    expect(paperToPrintPageSize({ widthMm: 80, heightMm: 0 })).toBeUndefined()
  })
})

describe('paperToPdfPageSize（printToPDF 存档）', () => {
  it('固定纸张 → 英寸对象', () => {
    expect(paperToPdfPageSize({ widthMm: 210, heightMm: 297 })).toEqual({ width: 210 / 25.4, height: 297 / 25.4 })
  })

  it('连续纸 → 高度退 297mm 占位（实际分页由 preferCSSPageSize 走模板 @page）', () => {
    expect(paperToPdfPageSize({ widthMm: 76, heightMm: 0 })).toEqual({ width: 76 / 25.4, height: 297 / 25.4 })
  })
})

describe('assertPaperSupported（纸宽 vs 打印机能力）', () => {
  it('无能力数据（maxWidthMm 缺省）→ 放行', () => {
    expect(() => assertPaperSupported({ widthMm: 210, heightMm: 297 }, undefined, 'p1')).not.toThrow()
  })

  it('纸宽未超能力 → 放行', () => {
    expect(() => assertPaperSupported({ widthMm: 80, heightMm: 0 }, 80, 'p1')).not.toThrow()
  })

  it('纸宽超能力 → PAPER_MISMATCH', () => {
    try {
      assertPaperSupported({ widthMm: 80, heightMm: 0 }, 58, 'p1')
      expect.unreachable('应当抛出')
    }
    catch (e) {
      expect((e as { code?: string }).code).toBe('PAPER_MISMATCH')
    }
  })
})
