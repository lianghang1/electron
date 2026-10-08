import type { PaperSpec, PrintOptions } from '@desktop/shared'
import { describe, expect, it } from 'vitest'
import { renderLabelZpl } from './zpl-render'

const LABEL: PaperSpec = { preset: 'label', widthMm: 40, heightMm: 30 }
const OPTS: PrintOptions = { paper: LABEL } as PrintOptions

const DATA = {
  title: '仓库物料标签',
  code: 'SKU-2026-0925',
  spec: '500ml × 24',
  date: '2026-09-25',
}

describe('renderLabelZpl', () => {
  it('基本结构：^XA…^XZ、^CI28（UTF-8）、宽高按 8dots/mm', () => {
    const zpl = new TextDecoder().decode(renderLabelZpl('label-default', DATA, OPTS, LABEL))
    expect(zpl.startsWith('^XA')).toBe(true)
    expect(zpl.trimEnd().endsWith('^XZ')).toBe(true)
    expect(zpl).toContain('^CI28')
    // 40mm × 8 = 320；30mm × 8 = 240
    expect(zpl).toContain('^PW320')
    expect(zpl).toContain('^LL240')
  })

  it('标题与字段行按序渲染', () => {
    const zpl = new TextDecoder().decode(renderLabelZpl('label-default', DATA, OPTS, LABEL))
    expect(zpl).toContain('^FD仓库物料标签^FS')
    expect(zpl).toContain('SKU-2026-0925')
    expect(zpl).toContain('500ml × 24')
    expect(zpl).toContain('2026-09-25')
  })

  it('qrData / overlays 二维码条码', () => {
    const zpl = new TextDecoder().decode(
      renderLabelZpl('label-default', { ...DATA, qrData: 'https://x/1' }, OPTS, LABEL),
    )
    expect(zpl).toContain('^BQN,2,4')

    const zpl2 = new TextDecoder().decode(
      renderLabelZpl('label-default', DATA, { ...OPTS, overlays: [{ type: 'barcode', data: '69123', format: 'code128' }] }, LABEL),
    )
    expect(zpl2).toContain('^BCN,50,Y,N,N')
  })

  it('zPL 特殊字符转义（^ → ^^）', () => {
    const zpl = new TextDecoder().decode(renderLabelZpl('label-default', { title: 'A^B~C' }, OPTS, LABEL))
    expect(zpl).toContain('A^^B')
  })

  it('非 label/custom 纸张 → PAPER_MISMATCH', () => {
    try {
      renderLabelZpl('label-default', DATA, { paper: { preset: 'a4' } } as PrintOptions, { preset: 'a4' })
      expect.unreachable('应当抛出')
    }
    catch (e) {
      expect((e as { code?: string }).code).toBe('PAPER_MISMATCH')
    }
  })

  it('未知模板 → OPTION_UNSUPPORTED', () => {
    try {
      renderLabelZpl('receipt-default', DATA, OPTS, LABEL)
      expect.unreachable('应当抛出')
    }
    catch (e) {
      expect((e as { code?: string }).code).toBe('OPTION_UNSUPPORTED')
    }
  })
})
