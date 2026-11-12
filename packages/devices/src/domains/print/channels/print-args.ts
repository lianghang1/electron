import type { PaperSpec, PrintErrorCode, PrintOptions } from '@shell/shared'

/** 统一 duplex 语义 → Electron print duplexMode */
export function duplexMode(duplex: PrintOptions['duplex']): 'shortEdge' | 'longEdge' {
  switch (duplex) {
    case 'duplexshort':
      return 'shortEdge'
    case 'duplexlong':
      return 'longEdge'
    default:
      return 'longEdge'
  }
}

const mmToInch = (mm: number): number => Math.max(0, mm) / 25.4
const mmToPt = (mm: number): number => Math.max(0, mm) * 2.83465

/** webContents.print 的 margins（静默路径）：默认跟随/零边距/自定义英寸 */
export function wcMarginType(margin: PrintOptions['margin']): Record<string, unknown> {
  if (margin === 'default') { return { marginType: 'default' } }
  if (margin == null || margin === 'none') { return { marginType: 'none' } }
  return {
    marginType: 'custom',
    top: mmToInch(margin.topMm),
    bottom: mmToInch(margin.bottomMm),
    left: mmToInch(margin.leftMm),
    right: mmToInch(margin.rightMm),
  }
}

/** CUPS lp 页边距（点）：仅 none/自定义生效，default 不传由系统决定 */
export function lpMarginOptions(margin: PrintOptions['margin']): Array<[string, string]> {
  if (margin === 'default' || margin == null) { return [] }
  if (margin === 'none') {
    return [['page-top', '0'], ['page-bottom', '0'], ['page-left', '0'], ['page-right', '0']]
  }
  return [
    ['page-top', String(Math.round(mmToPt(margin.topMm)))],
    ['page-bottom', String(Math.round(mmToPt(margin.bottomMm)))],
    ['page-left', String(Math.round(mmToPt(margin.leftMm)))],
    ['page-right', String(Math.round(mmToPt(margin.rightMm)))],
  ]
}

/** "1-3,5" → Electron pageRanges；非法输入返回 null（由调用方决定跳过） */
export function parsePageRanges(pages: string | undefined): Array<{ from: number, to: number }> | null {
  if (!pages?.trim()) { return null }
  const ranges: Array<{ from: number, to: number }> = []
  for (const part of pages.split(',')) {
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/)
    if (!m) { return null }
    const from = Number(m[1])
    ranges.push(m[2] ? { from, to: Number(m[2]) } : { from, to: from })
  }
  return ranges.length > 0 ? ranges : null
}

/** 物理尺寸 → 标准纸型名（SumatraPDF paper= 与 CUPS media= 共用；其他尺寸返回 null 由调用方处理） */
export function standardPaperName(paper?: PaperSpec): string | null {
  if (!paper || paper.heightMm <= 0) { return null }
  switch (`${paper.widthMm}x${paper.heightMm}`) {
    case '210x297':
      return 'A4'
    case '148x210':
      return 'A5'
    case '216x279':
      return 'Letter'
    case '216x356':
      return 'Legal'
    case '279x432':
      return 'Tabloid'
    default:
      return null
  }
}

/** PaperSpec → CUPS media=：标准尺寸用标准名，其余用 Custom.宽x高mm（连续纸不传，交驱动默认） */
export function lpMediaName(paper?: PaperSpec): string | null {
  if (!paper || paper.heightMm <= 0) { return null }
  return standardPaperName(paper) ?? `Custom.${paper.widthMm}x${paper.heightMm}mm`
}

/** 统一 duplex 语义 → CUPS sides 值 */
export function lpSides(duplex: PrintOptions['duplex']): string | null {
  switch (duplex) {
    case 'duplex':
    case 'duplexlong':
      return 'two-sided-long-edge'
    case 'duplexshort':
      return 'two-sided-short-edge'
    case 'simplex':
      return 'one-sided'
    default:
      return null
  }
}

export function sanitizeJobName(name: string): string {
  return name.replace(/[^\w\u4E00-\u9FA5.-]+/g, '_').slice(0, 80)
}

/** -print-settings 的份数、页码、奇偶页、黑白、双面、纸张、纸盒、缩放拼装 */
export function sumatraPrintSettings(options: PrintOptions, paper?: PaperSpec, copies = 1): string {
  const settings: string[] = []
  const n = Math.max(1, copies)
  if (n > 1) { settings.push(`${n}x`) }
  if (options.pages) { settings.push(options.pages) }
  if (options.subset) { settings.push(options.subset) }
  if (options.grayscale) { settings.push('monochrome') }
  if (options.duplex && options.duplex !== 'simplex') { settings.push(options.duplex) }
  if (options.landscape) { settings.push('landscape') }
  const paperName = standardPaperName(paper)
  if (paperName) { settings.push(`paper=${paperName}`) }
  if (options.bin) { settings.push(`bin=${options.bin}`) }
  settings.push(options.scale ?? 'fit')
  return settings.join(',')
}

export interface SumatraSpoolArgs {
  printerId: string
  pdfPath: string
  options: PrintOptions
  paper?: PaperSpec
  copies: number
}

/** Windows 静默送打的完整命令行：-print-to <队列> -silent -print-settings <串> <文件> */
export function buildSumatraArgs(input: SumatraSpoolArgs): string[] {
  return [
    '-print-to',
    input.printerId,
    '-silent',
    '-print-settings',
    sumatraPrintSettings(input.options, input.paper, input.copies),
    input.pdfPath,
  ]
}

export interface LpSpoolArgs {
  printerId: string
  pdfPath: string
  jobName: string
  options: PrintOptions
  paper?: PaperSpec
  copies: number
}

/** CUPS lp 的完整命令行：队列、份数、任务名、文件 + 由系统选项反序插入的 -o 参数 */
export function buildLpArgs(input: LpSpoolArgs): string[] {
  const args = ['-d', input.printerId, '-n', String(Math.max(1, input.copies)), '-t', sanitizeJobName(input.jobName), input.pdfPath]
  const o = input.options
  if (o.pages) { args.unshift('-P', o.pages) }
  if (o.subset) { args.unshift('-o', `page-set=${o.subset}`) }
  if (o.grayscale) { args.unshift('-o', 'ColorModel=Gray') }
  if (o.landscape) { args.unshift('-o', 'landscape') }
  const sides = lpSides(o.duplex)
  if (sides) { args.unshift('-o', `sides=${sides}`) }
  if (o.bin) { args.unshift('-o', `InputSlot=${o.bin}`) }
  const media = lpMediaName(input.paper)
  if (media) { args.unshift('-o', `media=${media}`) }
  if (o.scale === 'fit') { args.unshift('-o', 'fit-to-page') }
  for (const [k, v] of lpMarginOptions(o.margin)) { args.unshift('-o', `${k}=${v}`) }
  return args
}

/**
 * 送打进程失败 → 统一错误码。
 * Sumatra 退出码语义：0 成功；2 文件打不开；3 文档禁止打印；4 打印机不存在；5 驱动/设备失败；6 策略禁用。
 * lp 的退出码信息量低，按 stderr 文本判定；作业提交后的缺纸/脱机不在进程退出码里，交设备状态查询。
 */
export function classifyProcessFailure(cmd: string, code: number | null, stderr: string): { code: PrintErrorCode, message: string } {
  const detail = stderr.trim()
  const withDetail = (message: string) => detail ? `${message}（${detail}）` : message

  if (/sumatra/i.test(cmd)) {
    const byCode: Record<number, { code: PrintErrorCode, message: string }> = {
      2: { code: 'JOB_FAILED', message: '无法打开打印文件（未找到或格式不支持）' },
      3: { code: 'OPTION_UNSUPPORTED', message: '文档不允许打印' },
      4: { code: 'PRINTER_NOT_FOUND', message: '指定或默认的打印机不存在' },
      5: { code: 'PRINTER_OFFLINE', message: '打印机驱动或设备失败' },
      6: { code: 'CHANNEL_UNAVAILABLE', message: '受限策略禁用了打印' },
    }
    const known = code === null ? undefined : byCode[code]
    if (known) { return { code: known.code, message: withDetail(known.message) } }
  }

  const text = detail.toLowerCase()
  if (/cancel|abort/.test(text)) { return { code: 'JOB_CANCELED', message: withDetail('打印任务被取消') } }
  if (/unknown printer|no such printer|printer.*not found|destination.*not (?:found|exist)/.test(text)) {
    return { code: 'PRINTER_NOT_FOUND', message: withDetail('打印机不存在') }
  }
  if (/offline|disabled|paused|stopped|not accepting/.test(text)) {
    return { code: 'PRINTER_OFFLINE', message: withDetail('打印机离线或已停用') }
  }
  if (/busy|in use/.test(text)) { return { code: 'PRINTER_BUSY', message: withDetail('打印机忙') } }
  if (/permission|denied|forbidden|not authorized/.test(text)) {
    return { code: 'CHANNEL_UNAVAILABLE', message: withDetail('打印命令无执行权限') }
  }
  if (/invalid|unsupported|unknown option|bad option/.test(text)) {
    return { code: 'OPTION_UNSUPPORTED', message: withDetail('打印选项不被驱动支持') }
  }
  return { code: 'SPOOL_FAILED', message: withDetail(`打印命令退出码 ${code ?? '未知'}`) }
}
