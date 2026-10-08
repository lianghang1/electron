import { describe, expect, it } from 'vitest'
import {
  assertPaperSupported,
  paperHeightMm,
  paperToColumns,
  paperToPdfPageSize,
  paperToPrintPageSize,
  paperWidthMm,
} from './paper'

describe('paperToPrintPageSize（webContents.print 静默路径）', () => {
  it('固定纸张 → Chromium 预设名', () => {
    expect(paperToPrintPageSize({ preset: 'a4' })).toBe('A4')
    expect(paperToPrintPageSize({ preset: 'a5' })).toBe('A5')
    expect(paperToPrintPageSize({ preset: 'letter' })).toBe('Letter')
    expect(paperToPrintPageSize({ preset: 'legal' })).toBe('Legal')
    expect(paperToPrintPageSize({ preset: 'tabloid' })).toBe('Tabloid')
  })

  it('b5 → 自定义微米', () => {
    expect(paperToPrintPageSize({ preset: 'b5' })).toEqual({ width: 176000, height: 250000 })
  })

  it('连续纸（小票）→ undefined，省略 pageSize 交给驱动', () => {
    // Electron 37 要求对象 pageSize 的 width/height 均为正数，height:0 会报
    // "height and width properties are required for pageSize" —— 静默打印回归关键
    expect(paperToPrintPageSize({ preset: 'receipt58' })).toBeUndefined()
    expect(paperToPrintPageSize({ preset: 'receipt80' })).toBeUndefined()
  })

  it('label/custom：有高度 → 微米对象；heightMm≤0（连续）→ undefined', () => {
    expect(paperToPrintPageSize({ preset: 'label', widthMm: 40, heightMm: 30 })).toEqual({ width: 40000, height: 30000 })
    expect(paperToPrintPageSize({ preset: 'custom', widthMm: 76, heightMm: 0 })).toBeUndefined()
  })
})

describe('paperToPdfPageSize（printToPDF 存档）', () => {
  it('固定纸张 → 预设名', () => {
    expect(paperToPdfPageSize({ preset: 'a4' })).toBe('A4')
  })

  it('小票 → 固定英寸宽 + A4 高度占位（preferCSSPageSize 由模板 @page 决定）', () => {
    expect(paperToPdfPageSize({ preset: 'receipt80' })).toEqual({ width: 80 / 25.4, height: 11.69 })
  })

  it('连续自定义纸 → 高度退 297mm', () => {
    expect(paperToPdfPageSize({ preset: 'custom', widthMm: 76, heightMm: 0 })).toEqual({ width: 76 / 25.4, height: 297 / 25.4 })
  })
})

describe('paperToColumns（热敏字符列数）', () => {
  it('58mm → 32 列，80mm → 48 列，A4 → 64 列', () => {
    expect(paperToColumns({ preset: 'receipt58' })).toBe(32)
    expect(paperToColumns({ preset: 'receipt80' })).toBe(48)
    expect(paperToColumns({ preset: 'a4' })).toBe(64)
  })

  it('label 按物理宽度归列', () => {
    expect(paperToColumns({ preset: 'label', widthMm: 58, heightMm: 30 })).toBe(32)
    expect(paperToColumns({ preset: 'label', widthMm: 100, heightMm: 150 })).toBe(64)
  })
})

describe('paperWidthMm / paperHeightMm', () => {
  it('label/custom 取档案尺寸', () => {
    expect(paperWidthMm({ preset: 'label', widthMm: 100, heightMm: 180 })).toBe(100)
    expect(paperHeightMm({ preset: 'label', widthMm: 100, heightMm: 180 })).toBe(180)
  })

  it('连续纸 heightMm=0 → undefined（高度由打印机决定）', () => {
    expect(paperHeightMm({ preset: 'custom', widthMm: 76, heightMm: 0 })).toBeUndefined()
  })

  it('预设纸张：b5/legal/tabloid 有高，a4 高度未知', () => {
    expect(paperWidthMm({ preset: 'a4' })).toBe(210)
    expect(paperHeightMm({ preset: 'b5' })).toBe(250)
    expect(paperHeightMm({ preset: 'legal' })).toBe(356)
    expect(paperHeightMm({ preset: 'tabloid' })).toBe(432)
    expect(paperHeightMm({ preset: 'a4' })).toBeUndefined()
  })
})

describe('assertPaperSupported（纸宽 vs 打印机能力）', () => {
  it('无能力数据（maxWidthMm 缺省）→ 放行', () => {
    expect(() => assertPaperSupported({ preset: 'a4' }, undefined, 'p1')).not.toThrow()
  })

  it('纸宽未超能力 → 放行', () => {
    expect(() => assertPaperSupported({ preset: 'receipt80' }, 80, 'p1')).not.toThrow()
  })

  it('纸宽超能力 → PAPER_MISMATCH', () => {
    try {
      assertPaperSupported({ preset: 'receipt80' }, 58, 'p1')
      expect.unreachable('应当抛出')
    }
    catch (e) {
      expect((e as { code?: string }).code).toBe('PAPER_MISMATCH')
    }
  })
})
