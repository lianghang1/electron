import type { PaperSpec, PrintOptions } from '@desktop/shared'
import type { EscposApi } from './escpos-render'
import { describe, expect, it } from 'vitest'
import { displayWidth, renderReceiptEscpos, renderTemplateEscpos } from './escpos-render'

/** 录制器：把 EscposApi 调用记成 [method, ...args]，脱离 electron 直测渲染序列 */
function makeApi() {
  const calls: Array<[string, ...unknown[]]> = []
  const api: EscposApi & { calls: typeof calls, text: () => string[], names: () => string[] } = {
    alignLeft: () => void calls.push(['alignLeft']),
    alignCenter: () => void calls.push(['alignCenter']),
    alignRight: () => void calls.push(['alignRight']),
    bold: on => void calls.push(['bold', on]),
    setTextSize: (w, h) => void calls.push(['setTextSize', w, h]),
    println: t => void calls.push(['println', t]),
    newLine: () => void calls.push(['newLine']),
    printQRCode: d => void calls.push(['printQRCode', d]),
    printBarcode: d => void calls.push(['printBarcode', d]),
    cutPartial: () => void calls.push(['cutPartial']),
    cut: () => void calls.push(['cut']),
    openCashDrawer: () => void calls.push(['openCashDrawer']),
    calls,
    text: () => calls.filter(([m]) => m === 'println').map(([, t]) => t as string),
    names: () => calls.map(([m]) => m),
  }
  return api
}

const P58: PaperSpec = { widthMm: 58, heightMm: 0 }
const P80: PaperSpec = { widthMm: 80, heightMm: 0 }
const OPTS: PrintOptions = { paper: '80' }

const RECEIPT = {
  shopName: '黑猫咖啡·旗舰店',
  orderNo: 'SO-1',
  time: '2026-09-25 10:30',
  cashier: '小王',
  items: [
    { name: '拿铁（大杯/热）', qty: 2, price: '28.00', amount: '56.00' },
    { name: '燕麦曲奇', qty: 1, price: '15.00', amount: '15.00' },
  ],
  total: '71.00',
  payMethod: '微信支付',
}

describe('displayWidth（CJK 记 2 列）', () => {
  it('aSCII 记 1，CJK/全角记 2', () => {
    expect(displayWidth('abc')).toBe(3)
    expect(displayWidth('中文')).toBe(4)
    expect(displayWidth('中a文')).toBe(5)
    expect(displayWidth('ＡＢ')).toBe(4)
  })
})

describe('renderReceiptEscpos —— 指令序列', () => {
  it('店名居中加粗双倍字号，随后恢复正常', () => {
    const api = makeApi()
    renderReceiptEscpos(api, RECEIPT, OPTS, P80)
    const names = api.calls.map(([m]) => m)
    const center = names.indexOf('alignCenter')
    const shopIdx = api.calls.findIndex(([m, t]) => m === 'println' && t === RECEIPT.shopName)
    expect(center).toBeGreaterThanOrEqual(0)
    expect(center).toBeLessThan(shopIdx)
    expect(api.calls[shopIdx - 1]).toEqual(['setTextSize', 2, 2])
    expect(api.calls[shopIdx - 2]).toEqual(['bold', true])
    // 店名之后恢复
    expect(api.calls[shopIdx + 1]).toEqual(['setTextSize', 1, 1])
    expect(api.calls[shopIdx + 2]).toEqual(['bold', false])
  })

  it('58mm：分隔线 32 列，商品行右对齐金额且总宽不超列数', () => {
    const api = makeApi()
    renderReceiptEscpos(api, RECEIPT, OPTS, P58)
    const lines = api.text()
    expect(lines).toContain('-'.repeat(32))
    const row = lines.find(l => l.endsWith('56.00'))!
    expect(row).toBeDefined()
    expect(displayWidth(row)).toBeLessThanOrEqual(32)
  })

  it('80mm：分隔线 48 列，合计行加粗', () => {
    const api = makeApi()
    renderReceiptEscpos(api, RECEIPT, OPTS, P80)
    expect(api.text()).toContain('-'.repeat(48))
    const totalRow = api.text().find(l => l.includes('¥71.00'))!
    expect(totalRow).toBeDefined()
    // 合计行处于 bold(true) 区间内
    const totalIdx = api.calls.findIndex(([m, t]) => m === 'println' && t === totalRow)
    const boldBefore = api.calls.slice(0, totalIdx).reverse().findIndex(([m]) => m === 'bold')
    expect(api.calls.slice(0, totalIdx).reverse()[boldBefore]?.[1]).toBe(true)
  })

  it('金额超宽时名称截断、金额完整', () => {
    const api = makeApi()
    renderReceiptEscpos(
      api,
      { ...RECEIPT, items: [{ name: '超长名称的商品超长名称的商品超长名称的商品', amount: '12.34' }] },
      OPTS,
      P58,
    )
    const row = api.text().find(l => l.endsWith('12.34'))!
    expect(displayWidth(row)).toBeLessThanOrEqual(32)
  })

  it('qrData → 居中 QR 指令', () => {
    const api = makeApi()
    renderReceiptEscpos(api, { ...RECEIPT, qrData: 'https://x/1' }, OPTS, P80)
    const qr = api.calls.find(([m]) => m === 'printQRCode')
    expect(qr).toEqual(['printQRCode', 'https://x/1'])
  })

  it('无 qrData/overlays → 无 QR', () => {
    const api = makeApi()
    renderReceiptEscpos(api, RECEIPT, OPTS, P80)
    expect(api.names()).not.toContain('printQRCode')
  })

  it('钱箱指令在出票前（收银惯例：开箱同时出票）', () => {
    const api = makeApi()
    renderReceiptEscpos(api, RECEIPT, { ...OPTS, hardware: { openCashbox: true } }, P80)
    expect(api.names()[0]).toBe('openCashDrawer')
  })

  it('切刀：full → cut，partial → cutPartial，缺省 → 不切', () => {
    const full = makeApi()
    renderReceiptEscpos(full, RECEIPT, { ...OPTS, hardware: { cut: 'full' } }, P80)
    expect(full.names()).toContain('cut')
    expect(full.names()).not.toContain('cutPartial')

    const partial = makeApi()
    renderReceiptEscpos(partial, RECEIPT, { ...OPTS, hardware: { cut: 'partial' } }, P80)
    expect(partial.names()).toContain('cutPartial')
    expect(partial.names()).not.toContain('cut')

    const none = makeApi()
    renderReceiptEscpos(none, RECEIPT, OPTS, P80)
    expect(none.names()).not.toContain('cut')
    expect(none.names()).not.toContain('cutPartial')
  })

  it('overlays 的条码 → printBarcode', () => {
    const api = makeApi()
    renderReceiptEscpos(api, RECEIPT, { ...OPTS, overlays: [{ type: 'barcode', data: '6912345', format: 'code128' }] }, P80)
    expect(api.calls).toContainEqual(['printBarcode', '6912345'])
  })
})

describe('renderTemplateEscpos —— 模板路由', () => {
  it('receipt-default → 收据渲染器', () => {
    const api = makeApi()
    renderTemplateEscpos(api, 'receipt-default', RECEIPT, OPTS, P80)
    expect(api.text().length).toBeGreaterThan(0)
  })

  it('其它模板 → OPTION_UNSUPPORTED（raw 通道显式报错，不静默忽略）', () => {
    const api = makeApi()
    try {
      renderTemplateEscpos(api, 'label-default', {}, OPTS, P80)
      expect.unreachable('应当抛出')
    }
    catch (e) {
      expect((e as { code?: string }).code).toBe('OPTION_UNSUPPORTED')
    }
  })
})
