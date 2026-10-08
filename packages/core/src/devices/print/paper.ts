import type { PaperInput, PaperProfile, PaperSpec } from '@desktop/shared'
import { printError } from './errors'

/** 各预设纸张的物理宽度（mm）。热敏纸实际可打宽度略小于纸宽 */
export const PAPER_WIDTH_MM: Record<string, number> = {
  receipt58: 58,
  receipt80: 80,
  a4: 210,
  a5: 148,
  b5: 176,
  letter: 216,
  legal: 216,
  tabloid: 279,
}

export function paperWidthMm(paper: PaperSpec): number {
  if (paper.preset === 'label' || paper.preset === 'custom')
    return paper.widthMm
  return PAPER_WIDTH_MM[paper.preset]
}

export function paperHeightMm(paper: PaperSpec): number | undefined {
  if (paper.preset === 'label' || paper.preset === 'custom')
    return paper.heightMm || undefined // 0 = 连续纸，交由打印机决定
  if (paper.preset === 'b5')
    return 250
  if (paper.preset === 'legal')
    return 356
  if (paper.preset === 'tabloid')
    return 432
  return undefined
}

/** 热敏打印机字符列数（203dpi 下 58mm≈32 列，80mm≈48 列） */
export function paperToColumns(paper: PaperSpec): number {
  const w = paperWidthMm(paper)
  if (w <= 60)
    return 32
  if (w <= 84)
    return 48
  return 64
}

/**
 * webContents.print 的 pageSize（单位：微米 micron，1mm = 1000 micron）。
 * 返回 undefined = 连续卷纸（小票/连续标签）：Electron 37 要求对象 pageSize 的
 * width/height 均为正数，传 height:0 会报 "height and width properties are required
 * for pageSize" —— 因此连续纸必须整体省略 pageSize，纸宽与纸长交给驱动纸卷设置决定。
 * 固定纸张（A4 等）用 Chromium 预设名，B5 等非预设尺寸用自定义微米。
 */
export function paperToPrintPageSize(paper: PaperSpec): Electron.WebContentsPrintOptions['pageSize'] {
  switch (paper.preset) {
    case 'receipt58':
    case 'receipt80':
      return undefined
    case 'a4':
      return 'A4'
    case 'a5':
      return 'A5'
    case 'letter':
      return 'Letter'
    case 'legal':
      return 'Legal'
    case 'tabloid':
      return 'Tabloid'
    case 'b5':
      return { width: PAPER_WIDTH_MM.b5 * 1000, height: 250 * 1000 }
    case 'label':
    case 'custom':
      if (paper.heightMm <= 0)
        return undefined
      return { width: paper.widthMm * 1000, height: paper.heightMm * 1000 }
  }
}

/** printToPDF 的 pageSize（对象单位：英寸）。卷纸高度取内容自然分页，用 preferCSSPageSize 走模板 @page */
export function paperToPdfPageSize(paper: PaperSpec): Electron.PrintToPDFOptions['pageSize'] {
  switch (paper.preset) {
    case 'a4':
      return 'A4'
    case 'a5':
      return 'A5'
    case 'letter':
      return 'Letter'
    case 'legal':
      return 'Legal'
    case 'tabloid':
      return 'Tabloid'
    case 'receipt58':
      return { width: 58 / 25.4, height: 11.69 }
    case 'receipt80':
      return { width: 80 / 25.4, height: 11.69 }
    case 'b5':
      return { width: PAPER_WIDTH_MM.b5 / 25.4, height: 250 / 25.4 }
    case 'label':
    case 'custom':
      // heightMm 为 0（连续纸）时 PDF 存档退回固定高度，preferCSSPageSize 走模板 @page
      return { width: paper.widthMm / 25.4, height: (paper.heightMm || 297) / 25.4 }
  }
}

/** 业务纸张与打印机能力核对：纸宽超出打印机能力 → PAPER_MISMATCH */
export function assertPaperSupported(paper: PaperSpec, maxWidthMm: number | undefined, printerId: string): void {
  if (maxWidthMm == null)
    return
  if (paperWidthMm(paper) > maxWidthMm + 0.5) {
    throw printError(
      'PAPER_MISMATCH',
      `纸张宽度 ${paperWidthMm(paper)}mm 超出打印机(${printerId})最大可打宽度 ${maxWidthMm}mm`,
      { paper, maxWidthMm },
    )
  }
}

/**
 * 纸型库（单一数据源）：常用业务语义纸型 + 业务自定义。
 * submit/renderPreview 的 paper 支持纸型 ID（字符串）或 PaperSpec 对象。
 */
export const PAPER_LIBRARY: PaperProfile[] = [
  { id: 'receipt80', displayName: '收银小票 80mm', spec: { preset: 'receipt80' }, builtIn: true },
  { id: 'receipt58', displayName: '收银小票 58mm', spec: { preset: 'receipt58' }, builtIn: true },
  { id: 'a4', displayName: 'A4 文档', spec: { preset: 'a4' }, builtIn: true },
  { id: 'a5', displayName: 'A5', spec: { preset: 'a5' }, builtIn: true },
  { id: 'b5', displayName: 'B5', spec: { preset: 'b5' }, builtIn: true },
  { id: 'letter', displayName: 'Letter', spec: { preset: 'letter' }, builtIn: true },
  { id: 'legal', displayName: 'Legal', spec: { preset: 'legal' }, builtIn: true },
  { id: 'tabloid', displayName: 'Tabloid', spec: { preset: 'tabloid' }, builtIn: true },
  { id: 'label-40x30', displayName: '标签 40×30mm', spec: { preset: 'label', widthMm: 40, heightMm: 30 }, builtIn: true },
  { id: 'label-60x40', displayName: '标签 60×40mm', spec: { preset: 'label', widthMm: 60, heightMm: 40 }, builtIn: true },
  { id: 'label-100x150', displayName: '面单 100×150mm', spec: { preset: 'label', widthMm: 100, heightMm: 150 }, builtIn: true },
  { id: 'kitchen-76', displayName: '后厨单 76mm 连续', spec: { preset: 'custom', widthMm: 76, heightMm: 0 }, builtIn: true },
  { id: 'waybill-100x180', displayName: '快递面单 100×180mm', spec: { preset: 'custom', widthMm: 100, heightMm: 180 }, builtIn: true },
]

/** 纸型库访问入口（返回常量副本防误改） */
export function getPaperLibrary(): PaperProfile[] {
  return PAPER_LIBRARY.slice()
}

/** paper 入参归一：字符串 → 纸型库查找；对象原样。未知 ID → VALIDATION_FAILED */
export function resolvePaper(input: PaperInput): PaperSpec {
  if (typeof input === 'string') {
    const found = PAPER_LIBRARY.find(p => p.id === input)
    if (!found) {
      throw printError('VALIDATION_FAILED', `未知纸型 ID: ${input}`, {
        available: PAPER_LIBRARY.map(p => p.id),
      })
    }
    return found.spec
  }
  return input
}
