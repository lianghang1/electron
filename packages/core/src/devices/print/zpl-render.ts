import type { PaperSpec, PrintOptions } from '@desktop/shared'
import iconv from 'iconv-lite'
import { printError } from './errors'
import { paperHeightMm, paperWidthMm } from './paper'

/**
 * ZPL 标签渲染器（Zebra 及兼容机型）。TSPL/CPCL 机型后续按同样方式扩展。
 * 203dpi 打印头 = 8 dots/mm。
 */

const DOTS_PER_MM = 8

function esc(v: unknown): string {
  return v == null ? '' : String(v).replace(/\^/g, '^^').replace(/~/g, '~ ~').replace(/\\&/g, '\\&')
}

const LABEL_LABELS: Record<string, string> = {
  code: '编码: ',
  spec: '规格: ',
  date: '日期: ',
}

export function renderLabelZpl(
  templateId: string,
  data: Record<string, unknown>,
  options: PrintOptions,
  paper: PaperSpec,
): Uint8Array {
  if (templateId !== 'label-default') {
    throw printError('OPTION_UNSUPPORTED', `模板 ${templateId} 未提供 ZPL 指令渲染器`, { templateId })
  }
  if (paper.preset !== 'label' && paper.preset !== 'custom') {
    throw printError('PAPER_MISMATCH', 'ZPL 标签渲染要求 label/custom 纸张规格', { paper })
  }
  const pw = paperWidthMm(paper) * DOTS_PER_MM
  const ph = (paperHeightMm(paper) ?? 30) * DOTS_PER_MM

  let y = 12
  const parts: string[] = ['^XA', `^PW${pw}`, `^LL${ph}`, '^LH0,0', '^CI28']

  // 标题
  if (data.title) {
    parts.push(`^FO16,${y}^A0N,26,26^FD${esc(data.title)}^FS`)
    y += 34
  }
  // 字段行
  for (const key of ['code', 'spec', 'date'] as const) {
    if (data[key]) {
      parts.push(`^FO16,${y}^A0N,22,22^FD${LABEL_LABELS[key]}${esc(data[key])}^FS`)
      y += 28
    }
  }
  // 二维码（右下区域）
  const qrData = String(data.qrData ?? options.overlays?.find(o => o.type === 'qrcode')?.data ?? '')
  if (qrData) {
    parts.push(`^FO${Math.floor(pw * 0.55)},${Math.floor(ph * 0.45)}^BQN,2,4^FDLA,${esc(qrData)}^FS`)
  }
  // 条码（底部）
  const barcode = options.overlays?.find(o => o.type === 'barcode')
  if (barcode && barcode.type === 'barcode') {
    parts.push(`^BY2^FO16,${Math.max(ph - 70, y)}^BCN,50,Y,N,N^FD${esc(barcode.data)}^FS`)
  }

  parts.push('^XZ')
  return new Uint8Array(iconv.encode(parts.join('\n'), 'utf8'))
}
