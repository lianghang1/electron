import type { PaperSpec } from '@desktop/shared'
import { printError } from './errors'

/** 非序列标准纸张（mm，北美/行业惯称）：heightMm = 0 表示连续卷纸；字符串纸型写法的解析依据 */
export const STANDARD_PAPERS: Record<string, PaperSpec> = {
  letter: { widthMm: 216, heightMm: 279 },
  legal: { widthMm: 216, heightMm: 356 },
  tabloid: { widthMm: 279, heightMm: 432 },
  receipt58: { widthMm: 58, heightMm: 0 },
  receipt80: { widthMm: 80, heightMm: 0 },
}

/** ISO 216 系列基础尺寸（mm）：A0 841×1189、B0 1000×1414，低序号由上一级对折取整递推 */
const ISO_BASE: Record<'a' | 'b', PaperSpec> = {
  a: { widthMm: 841, heightMm: 1189 },
  b: { widthMm: 1000, heightMm: 1414 },
}

/** ISO 216 序号纸（a0–a10 / b0–b10）：下一级短边 = 上一级长边对折（floor），长边 = 上一级短边 */
function isoPaperSize(series: 'a' | 'b', index: number): PaperSpec {
  let { widthMm, heightMm } = ISO_BASE[series]
  for (let i = 0; i < index; i++) {
    const nextShort = Math.floor(heightMm / 2)
    heightMm = widthMm
    widthMm = nextShort
  }
  return { widthMm, heightMm }
}

/** 是否连续卷纸（高度由打印机纸卷决定）；未指定纸型按固定纸处理 */
export function isContinuousPaper(paper: PaperSpec | undefined): boolean {
  return paper != null && !(paper.heightMm > 0)
}

/**
 * 纸张写法宽松解析：标准名（大小写不敏感，含 ISO 216 序号纸 a0–a10/b0–b10 与
 * letter/receipt58/receipt80 等行业惯称）、纯数字宽 '80'（80mm 连续纸）、
 * '宽x高' '80x60'（分隔符 x/X/×/*，单位 mm）。
 * 驱动表单名等自由写法不强行识别：返回 undefined 交由打印机驱动默认纸张，不视为错误。
 */
export function resolvePaper(paper: string): PaperSpec | undefined {
  const key = paper.trim().toLowerCase()
  const std = STANDARD_PAPERS[key]
  if (std)
    return { ...std }
  const iso = /^([ab])(\d{1,2})$/.exec(key)
  if (iso && Number(iso[2]) <= 10)
    return isoPaperSize(iso[1] as 'a' | 'b', Number(iso[2]))
  const m = /^(\d+(?:\.\d+)?)(?:\s*[x×*]\s*(\d+(?:\.\d+)?))?$/.exec(key)
  if (m && Number(m[1]) > 0)
    return { widthMm: Number(m[1]), heightMm: m[2] ? Number(m[2]) : 0 }
  return undefined
}

/** 热敏打印机字符列数（203dpi 下 58mm≈32 列，80mm≈48 列）；未指定纸型按 80mm 常规宽度 */
export function paperToColumns(paper: PaperSpec | undefined): number {
  const widthMm = paper?.widthMm ?? 80
  if (widthMm <= 60)
    return 32
  if (widthMm <= 84)
    return 48
  return 64
}

/**
 * webContents.print 的 pageSize（单位：微米 micron，1mm = 1000 micron）。
 * 返回 undefined = 连续卷纸（小票/连续标签）或未指定纸型：Electron 37 要求对象
 * pageSize 的 width/height 均为正数，height:0 会报错 —— 连续纸必须整体省略
 * pageSize，纸宽与纸长交给驱动纸卷设置决定。
 */
export function paperToPrintPageSize(paper: PaperSpec | undefined): Electron.WebContentsPrintOptions['pageSize'] {
  if (paper == null || isContinuousPaper(paper))
    return undefined
  return { width: paper.widthMm * 1000, height: paper.heightMm * 1000 }
}

/** printToPDF 的 pageSize（对象单位：英寸）。未指定纸型/连续纸高度退固定占位，实际分页由 preferCSSPageSize 走模板 @page */
export function paperToPdfPageSize(paper: PaperSpec | undefined): Electron.PrintToPDFOptions['pageSize'] {
  if (paper == null)
    return undefined
  return { width: paper.widthMm / 25.4, height: (paper.heightMm || 297) / 25.4 }
}

/** 业务纸张与打印机能力核对：纸宽超出打印机能力 → PAPER_MISMATCH；未指定纸型跳过核对 */
export function assertPaperSupported(paper: PaperSpec | undefined, maxWidthMm: number | undefined, printerId: string): void {
  if (paper == null || maxWidthMm == null)
    return
  if (paper.widthMm > maxWidthMm + 0.5) {
    throw printError(
      'PAPER_MISMATCH',
      `纸张宽度 ${paper.widthMm}mm 超出打印机(${printerId})最大可打宽度 ${maxWidthMm}mm`,
      { paper, maxWidthMm },
    )
  }
}
