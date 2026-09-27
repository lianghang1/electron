import type {
  CremationScheduleResponse,
  DecodeQrcodeResponse,
  FhBusinessConfig,
  GetCertificateRequest,
  GetCertificateResponse,
  HallScheduleResponse,
  InvoiceApply,
  InvoiceListRequest,
  InvoiceListResponse,
  PayBillItem,
  PayBusiness,
  PayInvoiceInit,
  ProductItem,
  ReportRequest,
  RetailRequest,
  RetailResponse,
  SettlementInitRequest,
  SettlementInitResponse,
  SettlementMethod,
  SettlementRequest,
  SettlementResponse,
  ThirdPartyPayResponse,
} from '../../../src/types/funeral'
import type { FhIpc } from '../../../src/types/ipc'
import { createHandle } from '@desktop/core'
import { buildDemoPdf } from './demo-pdf'

/** 业务通道包装：channel / 入参 / 返回值全部受 FhIpc 契约约束 */
const handle = createHandle<FhIpc>()

/**
 * 殡仪馆业务服务（mock）：扫码解码 / 支付结算 / 业务单据 / 商品零售 / 发票 / 报表 / 班次。
 * 数据形态与真实后端一致（字段名对齐业务系统接口），对接时仅替换本文件实现。
 *
 * 真实接入位：
 * - fh:qrcode:decode        → 院内扫码解码服务
 * - fh:payment:*            → 支付中台（结算初始化/提交/支付单，二维码换微信/支付宝 Native codeUrl）
 * - fh:business:certQuery   → 业务系统按证件/条码反查业务单
 * - fh:business:certificate → 业务系统查电子火化证/寄存证
 * - fh:product:*            → 商品中台（商品列表/零售单）
 * - fh:invoice:list         → 发票平台开票记录
 * - fh:report:print         → 经平台 device:printer:print（厂商 Driver）出票
 * - fh:report:pdf           → 报表服务预览流
 * - fh:schedule:*           → 业务系统礼厅/火化排班
 *
 * mock 规则：支付会话创建 15s 后自动 paid；缴费成功且声明电子发票时自动生成
 * 「开票中」发票记录，20s 后翻转为「已开票」（供发票页轮询演示）。
 */

// ===== 业务单注册表 =====

interface BusinessRecord {
  businessId: string
  businessType: string
  business: PayBusiness
  billItems: PayBillItem[]
  amount: number
  paid: boolean
  hasElectronicInvoice: boolean
}

function billItem(billItemId: string, itemName: string, price: number, groupId: string): PayBillItem {
  return {
    billItemId,
    itemName,
    qty: 1,
    price,
    sumPrice: price,
    shouldPrice: price,
    discountPrice: 0,
    paymentPrice: price,
    orderType: '5',
    groupId,
  }
}

const BUSINESSES: BusinessRecord[] = [
  {
    businessId: 'BS202609240012',
    businessType: '5',
    business: { businessNo: '202609240012', linkman: '王小明', userName: '王建国' },
    billItems: [
      billItem('BI001', '遗体接运费', 480, '1'),
      billItem('BI002', '普通冷藏（三天）', 900, '1'),
      billItem('BI003', '告别厅（中型）使用费', 1200, '2'),
      billItem('BI004', '火化费（普通炉）', 280, '2'),
    ],
    amount: 2860,
    paid: false,
    hasElectronicInvoice: true,
  },
  {
    businessId: 'BS202609240031',
    businessType: '5',
    business: { businessNo: '202609240031', linkman: '王小明', userName: '王建国' },
    billItems: [
      billItem('BI011', '火化费（普通炉）', 1280, '2'),
      billItem('BI012', '骨灰盒（基础款）', 700, '3'),
    ],
    amount: 1980,
    paid: false,
    hasElectronicInvoice: true,
  },
  {
    businessId: 'BS202609250004',
    businessType: '5',
    business: { businessNo: '202609250004', linkman: '王小明', userName: '刘秀兰' },
    billItems: [
      billItem('BI021', '骨灰寄存费（一年）', 360, '1'),
    ],
    amount: 360,
    paid: true,
    hasElectronicInvoice: true,
  },
]

/** mock 家属身份证号：刷卡/手动输入命中即查询其名下业务单 */
const MOCK_ID_NUMBER = '110101196203054567'

// ===== 发票记录 =====

const INVOICE_APPLIES: InvoiceApply[] = [
  {
    id: 'IA0001',
    invoiceCode: '04203625000918456',
    invoiceNo: '25369230411',
    payInvoiceTime: '2026-09-25 10:24:00',
    invoiceTime: '2026-09-25 10:26:12',
    platform: '百望云',
    factPrice: 360,
    title: '王小明',
    businessId: 'BS202609250004',
    businessType: '5',
    payTaxInvoiceStatus: '3',
  },
]

/** 「开票中 → 已开票」翻转时长 */
const INVOICE_ISSUE_DELAY_MS = 20_000

// ===== 支付会话 =====

interface PaySession {
  createdAt: number
  paid: boolean
  amount: number
  businessId: string
  businessType: string
  groupId: string
  hasElectronicInvoice: boolean
  invoiceId?: string
  invoiceTitle: string
}

const PAY_SESSIONS = new Map<string, PaySession>()

/** mock 扫码支付到账时长 */
const PAY_SUCCESS_DELAY_MS = 15_000

// ===== 商品 =====

const PRODUCTS: ProductItem[] = [
  { itemId: 'P001', itemType: '01', itemName: '菊花花束（白）', sortId: '01', price: 99, realPrice: 99, unit: '束' },
  { itemId: 'P002', itemType: '01', itemName: '白事花篮', sortId: '01', price: 158, realPrice: 158, unit: '个' },
  { itemId: 'P003', itemType: '01', itemName: '菊花花圈', sortId: '01', price: 288, realPrice: 288, unit: '个' },
  { itemId: 'P004', itemType: '01', itemName: '鲜花小菊（单支）', sortId: '01', price: 8, realPrice: 8, unit: '支' },
  { itemId: 'P005', itemType: '02', itemName: '祭祀香烛套装', sortId: '02', price: 88, realPrice: 88, unit: '套' },
  { itemId: 'P006', itemType: '02', itemName: '金银元宝（一捆）', sortId: '02', price: 36, realPrice: 36, unit: '捆' },
  { itemId: 'P007', itemType: '02', itemName: '纸扎屋', sortId: '02', price: 120, realPrice: 120, unit: '座' },
  { itemId: 'P008', itemType: '02', itemName: '供品五件套', sortId: '02', price: 88, realPrice: 88, unit: '套' },
  { itemId: 'P009', itemType: '03', itemName: '寿衣（传统款）', sortId: '03', price: 680, realPrice: 680, unit: '套' },
  { itemId: 'P010', itemType: '03', itemName: '骨灰保护袋', sortId: '03', price: 45, realPrice: 45, unit: '个' },
  { itemId: 'P011', itemType: '03', itemName: '随葬玉器（平安扣）', sortId: '03', price: 299, realPrice: 299, unit: '件' },
  { itemId: 'P012', itemType: '03', itemName: '挽联（一副）', sortId: '03', price: 60, realPrice: 60, unit: '副' },
]

// ===== 班次 =====

const HALL_NAMES = ['万安厅', '菊厅', '梅厅', '兰厅', '竹厅', '鹤厅']
const HALL_SLOTS = [
  { start: '09:00', end: '10:00' },
  { start: '10:00', end: '11:00' },
  { start: '11:00', end: '12:00' },
  { start: '13:00', end: '14:00' },
  { start: '14:00', end: '15:00' },
]
const CREMATION_SLOTS = [
  { startTime: '08:30', endTime: '09:30' },
  { startTime: '09:30', endTime: '10:30' },
  { startTime: '10:30', endTime: '11:30' },
  { startTime: '13:30', endTime: '14:30' },
]
const CREMATION_FURNACE_COUNT = 6
const DECEASED_NAMES = ['张伟', '李淑芬', '王志强', '刘桂英', '陈立军', '杨秀珍', '赵德柱', '周桂香']

/** 按日期生成稳定伪随机种子：同一天查询结果一致，不同天班次有差异 */
function seedOf(date: string): number {
  let hash = 0
  for (const ch of date) hash = (hash * 31 + ch.charCodeAt(0)) % 9973
  return hash
}

// ===== 工具 =====

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const QR_PREFIXES = ['PB', 'dzhhz', 'dzjcz', 'NPE'] as const

// ===== 注册 =====

export function registerFhBusiness(businessConfig: FhBusinessConfig): void {
  handle('fh:config:get', () => businessConfig)
  handle('fh:qrcode:decode', (_event, input) => decodeQrcode(input.content))
  handle('fh:payment:methods', () => settlementMethods())
  handle('fh:payment:settlementInit', (_event, input) => settlementInit(input))
  handle('fh:payment:settlement', (_event, input) => settlement(input))
  handle('fh:payment:pending', () => [] as ThirdPartyPayResponse[])
  handle('fh:payment:order', (_event, serialNo) => payOrder(serialNo))
  handle('fh:payment:close', (_event, serialNo) => {
    PAY_SESSIONS.delete(serialNo)
  })
  handle('fh:business:certQuery', (_event, input) => certQuery(input.value))
  handle('fh:business:certificate', (_event, input) => certificate(input))
  handle('fh:product:list', () => [...PRODUCTS])
  handle('fh:product:retail', (_event, input) => retail(input))
  handle('fh:invoice:list', (_event, input) => invoiceList(input))
  handle('fh:report:print', async (_event, input) => {
    // 真实接入位：经平台 device:printer:print（厂商 Driver）出票
    console.log(`[fh:report:print] code=${input.code} extParams=${JSON.stringify(input.extParams ?? {})}`)
    await delay(400)
  })
  handle('fh:report:pdf', (_event, input) => buildDemoPdf(reportLines(input)))
  handle('fh:schedule:hall', (_event, input) => hallSchedule(input.selectDate))
  handle('fh:schedule:cremation', (_event, input) => cremationSchedule(input.selectDate))
}

// ===== 实现 =====

function decodeQrcode(content: string): DecodeQrcodeResponse {
  const raw = content.trim()
  if (raw.includes('|')) {
    const [prefix, value] = raw.split('|')
    return { prefix, value }
  }
  const prefix = QR_PREFIXES.find(item => raw.startsWith(item))
  return { prefix: prefix ?? '', value: prefix ? raw.slice(prefix.length) : raw }
}

function settlementMethods(): SettlementMethod[] {
  return [
    { methodCode: 'WECHAT_QR', methodName: '微信支付', extendData: { icon: 'wechat', color: '#07c160', code: 'WECHAT' } },
    { methodCode: 'ALI_QR', methodName: '支付宝', extendData: { icon: 'alipay', color: '#1677ff', code: 'ALIPAY' } },
  ]
}

function findBusiness(businessId: string): BusinessRecord | undefined {
  return BUSINESSES.find(record => record.businessId === businessId)
}

function settlementInit(input: SettlementInitRequest): SettlementInitResponse {
  const record = findBusiness(input.businessId)
  if (!record) {
    throw new Error(`业务单不存在：${input.businessId}`)
  }
  const invoiceInit: PayInvoiceInit = {
    businessId: record.businessId,
    businessType: record.businessType,
    title: record.business.userName ?? '',
    phone: '',
    remark: '',
  }
  return {
    billItems: record.billItems,
    business: record.business,
    invoiceInit,
    settlementMethods: settlementMethods().map(method => ({ ...method, paymentPrice: record.amount })),
  }
}

function settlement(input: SettlementRequest): SettlementResponse {
  const record = findBusiness(input.businessId)
  const amount = input.payItems.reduce((sum, item) => sum + (item.paymentPrice ?? 0), 0)
  const serialNo = `SN${Date.now()}`
  const session: PaySession = {
    createdAt: Date.now(),
    paid: false,
    amount,
    businessId: input.businessId,
    businessType: input.businessType,
    groupId: input.payItems[0]?.groupId ?? '',
    hasElectronicInvoice: record?.hasElectronicInvoice ?? false,
    invoiceTitle: input.settlementInvoice?.title ?? record?.business.userName ?? '',
  }
  PAY_SESSIONS.set(serialNo, session)
  // 真实接入位：调微信/支付宝 Native 下单，qrUrl 用返回的 codeUrl
  return {
    thirdPartyPay: true,
    payResponse: {
      channelCode: 'mock',
      wayCode: 'MOCK_QR',
      serialNo,
      qrUrl: `https://pay.demo.fh/qr/${serialNo}`,
      pid: 'FH-KIOSK',
      payStatus: '0',
      orderId: `PO${Date.now()}`,
      expiredTime: formatTime(session.createdAt + 2 * 60_000),
      amount,
      paymentGroupId: session.groupId,
      hasElectronicInvoice: session.hasElectronicInvoice,
    },
  }
}

function payOrder(serialNo: string): ThirdPartyPayResponse {
  const session = PAY_SESSIONS.get(serialNo)
  if (!session) {
    throw new Error(`支付单不存在：${serialNo}`)
  }
  if (!session.paid && Date.now() - session.createdAt >= PAY_SUCCESS_DELAY_MS) {
    session.paid = true
    markBusinessPaid(session)
    if (session.hasElectronicInvoice)
      session.invoiceId = createInvoiceApply(session)
  }
  return {
    channelCode: 'mock',
    wayCode: 'MOCK_QR',
    serialNo,
    qrUrl: `https://pay.demo.fh/qr/${serialNo}`,
    pid: 'FH-KIOSK',
    payStatus: session.paid ? '2' : '0',
    orderId: `PO${session.createdAt}`,
    expiredTime: formatTime(session.createdAt + 2 * 60_000),
    amount: session.amount,
    paymentGroupId: session.groupId,
    hasElectronicInvoice: session.hasElectronicInvoice,
    invoices: session.invoiceId ? [{ invoiceId: session.invoiceId }] : undefined,
  }
}

function markBusinessPaid(session: PaySession): void {
  const record = findBusiness(session.businessId)
  if (record)
    record.paid = true
}

function createInvoiceApply(session: PaySession): string {
  const invoiceId = `IA${session.createdAt}`
  const record = findBusiness(session.businessId)
  INVOICE_APPLIES.unshift({
    id: invoiceId,
    invoiceCode: `04203625${String(session.createdAt).slice(-8)}`,
    invoiceNo: '',
    payInvoiceTime: formatTime(session.createdAt),
    platform: '百望云',
    factPrice: session.amount,
    title: session.invoiceTitle || record?.business.userName || '',
    businessId: session.businessId,
    businessType: session.businessType,
    payTaxInvoiceStatus: '2',
  })
  return invoiceId
}

function certQuery(value: string): string {
  const raw = value.trim()
  if (raw === MOCK_ID_NUMBER)
    return BUSINESSES[0].businessId
  if (findBusiness(raw))
    return raw
  return ''
}

function certificate(input: GetCertificateRequest): GetCertificateResponse {
  // 真实接入位：业务系统按 bizId + type（02 火化证 / 03 寄存证）查询
  const known = input.bizId === 'BS202609240012' || input.bizId === 'BS202609240031'
  const stored = input.bizId === 'BS202609250004'
  if (input.type === '02' && known) {
    return { bizId: input.bizId, certificateNo: `HZ2026-${input.bizId.slice(-6)}`, issueDate: '2026-09-25', status: '3' }
  }
  if (input.type === '03' && stored) {
    return { bizId: input.bizId, certificateNo: 'JC2026-000108', issueDate: '2026-09-26', status: '3' }
  }
  return { bizId: input.bizId, certificateNo: '', issueDate: '', status: '0' }
}

function retail(input: RetailRequest): RetailResponse {
  const businessId = `RT${Date.now()}`
  const payBusinessType = '6'
  const billItems: PayBillItem[] = input.items.map((item, index) => ({
    billItemId: `RT${index}`,
    itemId: item.itemId,
    itemType: item.itemType,
    itemName: item.itemName,
    qty: item.qty,
    price: item.price,
    sumPrice: item.qty * item.price,
    paymentPrice: item.qty * item.price,
    groupId: '3',
  }))
  BUSINESSES.push({
    businessId,
    businessType: payBusinessType,
    business: { businessNo: businessId, linkman: input.mobileNo ?? '', userName: '' },
    billItems,
    amount: billItems.reduce((sum, item) => sum + (item.paymentPrice ?? 0), 0),
    paid: false,
    hasElectronicInvoice: false,
  })
  return { id: businessId, payBusinessType }
}

function invoiceList(input: InvoiceListRequest): InvoiceListResponse {
  transitionInvoiceStatus()
  const record = findBusiness(input.businessId)
  return {
    business: record?.business,
    applyList: INVOICE_APPLIES.filter(apply => apply.businessId === input.businessId),
  }
}

/** 「开票中」到期翻转为「已开票」（懒翻转：查询时结算状态） */
function transitionInvoiceStatus(): void {
  for (const apply of INVOICE_APPLIES) {
    if (apply.payTaxInvoiceStatus !== '2')
      continue
    const appliedAt = Number(apply.id.slice(2))
    if (!Number.isNaN(appliedAt) && Date.now() - appliedAt >= INVOICE_ISSUE_DELAY_MS) {
      apply.payTaxInvoiceStatus = '3'
      apply.invoiceNo = `253692${String(appliedAt).slice(-5)}`
      apply.invoiceTime = formatTime(appliedAt + INVOICE_ISSUE_DELAY_MS)
    }
  }
}

function reportLines(input: ReportRequest): string[] {
  const lines = [`Demo Report: ${input.code}`, 'Generated by FhKiosk mock service', '']
  for (const [key, value] of Object.entries(input.extParams ?? {}))
    lines.push(`${key}: ${value}`)
  return lines
}

function hallSchedule(selectDate: string): HallScheduleResponse {
  const seed = seedOf(selectDate)
  return {
    list: HALL_NAMES.map((name, hallIndex) => ({
      name,
      schedules: HALL_SLOTS.map((slot, slotIndex) => {
        const booked = (seed + hallIndex * 7 + slotIndex * 13) % 10 < 3
        const nextSeed = seed + hallIndex * 3 + slotIndex * 11
        return {
          id: `${name}-${slot.start}`,
          startTime: `${selectDate} ${slot.start}:00`,
          endTime: `${selectDate} ${slot.end}:00`,
          bizInfo: booked
            ? [{
                name: DECEASED_NAMES[nextSeed % DECEASED_NAMES.length],
                businessNo: `NO2026${(nextSeed * 37) % 900000 + 100000}`,
              }]
            : [],
        }
      }),
    })),
  }
}

function cremationSchedule(selectDate: string): CremationScheduleResponse {
  const seed = seedOf(selectDate)
  return {
    list: CREMATION_SLOTS.map((slot, slotIndex) => ({
      extend: { startTime: slot.startTime, endTime: slot.endTime },
      schedules: Array.from({ length: CREMATION_FURNACE_COUNT }, (_, furnaceIndex) => {
        const booked = (seed + slotIndex * 17 + furnaceIndex * 5) % 10 < 4
        const nextSeed = seed + slotIndex * 7 + furnaceIndex * 3
        return {
          id: `${slot.startTime}-${furnaceIndex}`,
          bizInfo: booked
            ? [{
                name: DECEASED_NAMES[nextSeed % DECEASED_NAMES.length],
                businessNo: `NO2026${(nextSeed * 41) % 900000 + 100000}`,
              }]
            : [],
        }
      }),
    })),
  }
}
