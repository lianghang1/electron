import type { PaperSpec, PrintOptions } from '@desktop/shared'
import { printError } from './errors'
import { paperToColumns } from './paper'

/**
 * ESC/POS 指令渲染器：把"模板 + 结构化数据"翻译成小票机指令序列。
 * 与 HTML 模板（系统队列用）一一对应，同一份业务数据两种呈现。
 *
 * 热敏打印机多为 203dpi/内置 GB18030 字库，中文由打印机字库直接渲染；
 * 字符列数按纸张宽度归一（58→32 列，80→48 列）。
 */

/** 对 ThermalPrinter 的最小接口抽象，便于脱离 electron 单测与 mock */
export interface EscposApi {
  alignLeft: () => void
  alignCenter: () => void
  alignRight: () => void
  bold: (on: boolean) => void
  setTextSize: (width: number, height: number) => void
  println: (text: string) => void
  newLine: () => void
  printQRCode: (data: string) => void
  printBarcode: (data: string) => void
  cutPartial: () => void
  cut: () => void
  openCashDrawer: () => void
}

/** 终端宽度按显示宽度计：CJK/全角记 2 列 */
export function displayWidth(text: string): number {
  let w = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    w += code >= 0x2E80 && code <= 0x9FFF ? 2 : code >= 0xFF00 && code <= 0xFFEF ? 2 : 1
  }
  return w
}

/** 左右分栏：name 左对齐、amount 右对齐，超宽截断 */
function splitRow(left: string, right: string, cols: number): string {
  const wLeft = displayWidth(left)
  const wRight = displayWidth(right)
  const total = wLeft + wRight
  let l = left
  if (total > cols) {
    // 优先保证金额完整，名称截断（显示宽度换算回字符）
    const maxLeft = cols - wRight
    l = truncateToWidth(left, Math.max(maxLeft, 4))
  }
  const pad = Math.max(cols - displayWidth(l) - displayWidth(right), 1)
  return l + ' '.repeat(pad) + right
}

function truncateToWidth(text: string, maxWidth: number): string {
  let w = 0
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    const cw = code >= 0x2E80 && code <= 0x9FFF ? 2 : 1
    if (w + cw > maxWidth)
      break
    out += ch
    w += cw
  }
  return out
}

function str(v: unknown): string {
  return v == null ? '' : String(v)
}

const ROW_LABELS: Record<string, string> = {
  orderNo: '单号: ',
  time: '时间: ',
  cashier: '收银: ',
}

export function renderReceiptEscpos(
  api: EscposApi,
  data: Record<string, unknown>,
  options: PrintOptions,
  paper: PaperSpec,
): void {
  const cols = paperToColumns(paper)
  const hw = options.hardware ?? {}

  // 钱箱指令在出票前发送（收银场景惯例：开箱放钱、同时出票）
  if (hw.openCashbox)
    api.openCashDrawer()

  // 店名：居中 + 加粗 + 双倍字号
  api.alignCenter()
  api.bold(true)
  api.setTextSize(2, 2)
  api.println(str(data.shopName || '小票'))
  api.setTextSize(1, 1)
  api.bold(false)
  if (data.shopSub)
    api.println(str(data.shopSub))

  api.alignLeft()
  api.println('-'.repeat(cols))

  for (const key of ['orderNo', 'time', 'cashier'] as const) {
    if (data[key])
      api.println(`${ROW_LABELS[key]}${str(data[key])}`)
  }
  api.println('-'.repeat(cols))

  // 品名/数量/小计 三列（品名+数量同行，金额右对齐）
  const items = Array.isArray(data.items) ? data.items : []
  for (const item of items) {
    const it = item as Record<string, unknown>
    api.println(splitRow(str(it.name), str(it.amount ?? ''), cols))
    if (it.qty != null || it.price != null) {
      api.println(`  x${str(it.qty ?? 1)} @ ${str(it.price ?? '')}`)
    }
  }

  api.println('-'.repeat(cols))
  api.bold(true)
  api.println(splitRow('合计', `¥${str(data.total ?? '0.00')}`, cols))
  api.bold(false)
  if (data.payMethod)
    api.println(splitRow('支付方式', str(data.payMethod), cols))

  // 二维码：业务数据优先，overlays 兜底
  const overlayQr = options.overlays?.find(o => o.type === 'qrcode')?.data
  const qrData = str(data.qrData || (overlayQr ?? ''))
  if (qrData) {
    api.newLine()
    api.alignCenter()
    api.printQRCode(qrData)
  }
  // 条码 overlays
  for (const o of options.overlays ?? []) {
    if (o.type === 'barcode') {
      api.alignCenter()
      api.printBarcode(o.data)
    }
  }

  // 走纸 + 切纸
  const feed = hw.feedLines ?? 2
  for (let i = 0; i < feed; i++) api.newLine()
  switch (hw.cut) {
    case 'partial':
      api.cutPartial()
      break
    case 'full':
      api.cut()
      break
    case 'none':
    case undefined:
      break
  }
}

/** 模板 id → 指令渲染器；没有指令渲染器的模板走 raw 通道时显式报错 */
export function renderTemplateEscpos(
  api: EscposApi,
  templateId: string,
  data: Record<string, unknown>,
  options: PrintOptions,
  paper: PaperSpec,
): void {
  if (templateId === 'receipt-default') {
    renderReceiptEscpos(api, data, options, paper)
    return
  }
  throw printError(
    'OPTION_UNSUPPORTED',
    `模板 ${templateId} 未提供 ESC/POS 指令渲染器，无法走指令直写通道`,
    { templateId },
  )
}
