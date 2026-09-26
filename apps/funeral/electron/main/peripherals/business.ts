import type {
  FhInvoice,
  FhInvoiceTitle,
  FhOrder,
  FhPaySession,
  FhPayStatus,
} from '@desktop/shared'
import { handle } from '@desktop/core'

/**
 * 殡仪馆业务服务（mock）：业务单查询 / 支付会话 / 发票。
 *
 * 真实接入位：各 handler 替换为殡仪馆业务系统与支付、发票平台接口
 * （对接时仅改本文件与 idcard-reader/printer，契约与业务页不动）。
 * 支付 mock 规则：创建支付会话 15 秒后状态自动变为 paid（模拟家属扫码成功）。
 */

const ORDERS: FhOrder[] = [
  {
    orderNo: 'FH20260924-0012',
    deceasedName: '王建国',
    items: ['遗体接运费', '普通冷藏三天', '告别厅（中型）使用费'],
    amount: 2860,
    status: 'unpaid',
    invoiced: false,
  },
  {
    orderNo: 'FH20260924-0031',
    deceasedName: '王建国',
    items: ['火化费（普通炉）', '骨灰盒（基础款）'],
    amount: 1980,
    status: 'unpaid',
    invoiced: false,
  },
  {
    orderNo: 'FH20260925-0004',
    deceasedName: '刘秀兰',
    items: ['骨灰寄存费（一年）'],
    amount: 360,
    status: 'paid',
    invoiced: false,
  },
]

const INVOICES: FhInvoice[] = [
  {
    invoiceNo: '04203625000918456',
    title: { type: 'person', name: '王小明' },
    orderNo: 'FH20260923-0088',
    amount: 1200,
    issuedAt: '2026-09-23 14:36',
  },
]

/** mock 身份证号（家属）：刷卡/手动输入命中即返回全部 mock 业务单 */
const MOCK_ID_NUMBER = '110101196203054567'

/** 支付会话：orderNo → 创建时间戳 */
const PAY_SESSIONS = new Map<string, number>()
const PAY_SUCCESS_DELAY_MS = 15_000

export function registerBusiness(): void {
  handle('fh:order:query', (_event, query) => queryOrders(query))
  handle('fh:pay:create', (_event, orderNo) => createPay(orderNo))
  handle('fh:pay:status', (_event, orderNo) => payStatus(orderNo))
  handle('fh:invoice:list', (_event, query) => listInvoices(query))
  handle('fh:invoice:issue', (_event, input) => issueInvoice(input))
}

function queryOrders(query: { code?: string, idNumber?: string }): FhOrder[] {
  if (query.code)
    return ORDERS.filter(order => order.orderNo === query.code)
  if (query.idNumber && query.idNumber === MOCK_ID_NUMBER)
    return [...ORDERS]
  return []
}

function createPay(orderNo: string): FhPaySession {
  PAY_SESSIONS.set(orderNo, Date.now())
  // 真实接入位：调用微信/支付宝 Native 下单，用返回的 codeUrl 作为 qrContent
  return {
    orderNo,
    qrContent: `https://pay.demo.fh/${orderNo}?t=${Date.now()}`,
    expiresIn: 120,
  }
}

function payStatus(orderNo: string): FhPayStatus {
  const createdAt = PAY_SESSIONS.get(orderNo)
  if (!createdAt)
    return 'pending'
  return Date.now() - createdAt >= PAY_SUCCESS_DELAY_MS ? 'paid' : 'pending'
}

function listInvoices(query: { code?: string, idNumber?: string }): FhInvoice[] {
  // mock：有任意查询凭据即返回全部 mock 发票 + 本会话新开的发票
  if (query.code || query.idNumber)
    return [...INVOICES]
  return []
}

function issueInvoice(input: { orderNo: string, title: FhInvoiceTitle }): FhInvoice {
  const order = ORDERS.find(item => item.orderNo === input.orderNo)
  if (order)
    order.invoiced = true
  const invoice: FhInvoice = {
    // 真实接入位：调用发票平台开票接口，返回税控票号
    invoiceNo: `04203625${String(Date.now()).slice(-8)}`,
    title: input.title,
    orderNo: input.orderNo,
    amount: order?.amount ?? 0,
    issuedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  }
  INVOICES.unshift(invoice)
  return invoice
}
