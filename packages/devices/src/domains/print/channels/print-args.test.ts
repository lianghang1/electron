import type { PaperSpec, PrintOptions } from '@shell/shared'
import { describe, expect, it } from 'vitest'
import {
  buildLpArgs,
  buildSumatraArgs,
  classifyProcessFailure,
  duplexMode,
  lpMarginOptions,
  lpMediaName,
  lpSides,
  parsePageRanges,
  sanitizeJobName,
  standardPaperName,
  sumatraPrintSettings,
  wcMarginType,
} from './print-args'

const A4: PaperSpec = { widthMm: 210, heightMm: 297 }
const opts = (extra: Partial<PrintOptions> = {}): PrintOptions => ({ paper: 'A4', ...extra })

describe('页码与纸型翻译', () => {
  it('页码范围支持单页、区间与逗号分段，非法输入跳过', () => {
    expect(parsePageRanges('1-3,5')).toEqual([{ from: 1, to: 3 }, { from: 5, to: 5 }])
    expect(parsePageRanges(' 2 - 4 ')).toEqual([{ from: 2, to: 4 }])
    expect(parsePageRanges('')).toBeNull()
    expect(parsePageRanges('1-x')).toBeNull()
    expect(parsePageRanges('abc')).toBeNull()
  })

  it('标准纸型用标准名，自定义尺寸用 Custom，连续纸不传', () => {
    expect(standardPaperName(A4)).toBe('A4')
    expect(standardPaperName({ widthMm: 80, heightMm: 120 })).toBeNull()
    expect(standardPaperName({ widthMm: 80, heightMm: 0 })).toBeNull()
    expect(lpMediaName(A4)).toBe('A4')
    expect(lpMediaName({ widthMm: 80, heightMm: 120 })).toBe('Custom.80x120mm')
    expect(lpMediaName({ widthMm: 80, heightMm: 0 })).toBeNull()
  })

  it('双面语义与边距换算', () => {
    expect(duplexMode('duplexshort')).toBe('shortEdge')
    expect(duplexMode('duplexlong')).toBe('longEdge')
    expect(lpSides('duplex')).toBe('two-sided-long-edge')
    expect(lpSides('duplexshort')).toBe('two-sided-short-edge')
    expect(lpSides('simplex')).toBe('one-sided')
    expect(lpSides(undefined)).toBeNull()
    expect(lpMarginOptions('none')).toEqual([
      ['page-top', '0'],
      ['page-bottom', '0'],
      ['page-left', '0'],
      ['page-right', '0'],
    ])
    expect(lpMarginOptions('default')).toEqual([])
    expect(wcMarginType('default')).toEqual({ marginType: 'default' })
    expect(wcMarginType('none')).toEqual({ marginType: 'none' })
  })

  it('任务名只保留文件名安全字符并限长', () => {
    expect(sanitizeJobName('订单 2026/11: 打印')).toBe('订单_2026_11_打印')
    expect(sanitizeJobName('a'.repeat(120)).length).toBe(80)
  })
})

describe('sumatra 送打参数', () => {
  it('打印设置按份数、页码、奇偶、黑白、双面、纸张、纸盒、缩放拼装', () => {
    const settings = sumatraPrintSettings(opts({
      pages: '1-3,5',
      subset: 'odd',
      grayscale: true,
      duplex: 'duplexlong',
      landscape: true,
      bin: '2',
      scale: 'shrink',
    }), A4, 3)
    expect(settings).toBe('3x,1-3,5,odd,monochrome,duplexlong,landscape,paper=A4,bin=2,shrink')
  })

  it('命令行固定为 -print-to / -silent / -print-settings / 文件', () => {
    expect(buildSumatraArgs({ printerId: 'PRINTER', pdfPath: '/tmp/doc.pdf', options: opts(), paper: A4, copies: 1 }))
      .toEqual(['-print-to', 'PRINTER', '-silent', '-print-settings', 'paper=A4,fit', '/tmp/doc.pdf'])
  })

  it('单份不写份数，缺省缩放为 fit', () => {
    expect(sumatraPrintSettings(opts(), undefined, 1)).toBe('fit')
  })
})

describe('lp 送打参数', () => {
  it('队列、份数、任务名、文件与全部 -o 选项齐备', () => {
    const args = buildLpArgs({
      printerId: 'PRINTER',
      pdfPath: '/tmp/doc.pdf',
      jobName: 'order 2026/11',
      options: opts({
        pages: '1-3',
        subset: 'odd',
        grayscale: true,
        landscape: true,
        duplex: 'duplexlong',
        bin: '2',
        scale: 'fit',
        margin: 'none',
      }),
      paper: A4,
      copies: 2,
    })
    expect(args.slice(0, 2)).toEqual(['-o', 'page-right=0'])
    expect(args.slice(-1)).toEqual(['/tmp/doc.pdf'])
    expect(args).toContain('PRINTER')
    expect(args).toContain('2')
    expect(args).toContain('order_2026_11')
    expect(args).toContain('1-3')
    for (const item of [
      '-o',
      'media=A4',
      'ColorModel=Gray',
      'landscape',
      'sides=two-sided-long-edge',
      'InputSlot=2',
      'fit-to-page',
      'page-set=odd',
    ]) {
      expect(args).toContain(item)
    }
  })

  it('连续纸不追加 media 选项', () => {
    const args = buildLpArgs({
      printerId: 'P',
      pdfPath: '/tmp/a.pdf',
      jobName: 'a',
      options: opts(),
      paper: { widthMm: 80, heightMm: 0 },
      copies: 1,
    })
    expect(args.some(a => a.startsWith('media='))).toBe(false)
  })
})

describe('送打进程失败分类', () => {
  it('退出码 2/3/4/5/6 各自映射到具体错误码', () => {
    const cases: Array<[number, string]> = [
      [2, 'JOB_FAILED'],
      [3, 'OPTION_UNSUPPORTED'],
      [4, 'PRINTER_NOT_FOUND'],
      [5, 'PRINTER_OFFLINE'],
      [6, 'CHANNEL_UNAVAILABLE'],
    ]
    for (const [exit, code] of cases) {
      expect(classifyProcessFailure('SumatraPDF.exe', exit, '').code).toBe(code)
    }
    expect(classifyProcessFailure('SumatraPDF.exe', 99, '').code).toBe('SPOOL_FAILED')
  })

  it('lp 以 stderr 文本判定：不存在/离线/忙/权限/选项/取消', () => {
    const cases: Array<[string, string]> = [
      ['lp: Unknown printer "foo"', 'PRINTER_NOT_FOUND'],
      ['lp: The printer is offline', 'PRINTER_OFFLINE'],
      ['lp: Printer busy, try later', 'PRINTER_BUSY'],
      ['lp: Permission denied', 'CHANNEL_UNAVAILABLE'],
      ['lp: Unsupported option -Z', 'OPTION_UNSUPPORTED'],
      ['Job canceled by user', 'JOB_CANCELED'],
      ['lp: transient failure', 'SPOOL_FAILED'],
    ]
    for (const [stderr, code] of cases) {
      expect(classifyProcessFailure('lp', 1, stderr).code).toBe(code)
    }
  })

  it('原始 stderr 保留在错误信息里', () => {
    const failure = classifyProcessFailure('lp', 1, 'lp: Unknown printer "foo"')
    expect(failure.message).toContain('lp: Unknown printer "foo"')
  })
})
