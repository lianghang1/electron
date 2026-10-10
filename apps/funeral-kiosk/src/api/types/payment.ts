export interface PayBillItem {
  billItemId?: string
  orderItemId?: string
  itemType?: string
  itemId?: string
  itemName?: string
  qty?: number
  price?: number
  sumPrice?: number
  shouldPrice?: number
  discountPrice?: number
  orderId?: string
  orderType?: string
  paymentPrice?: number
  billVersion?: number
  groupId?: string
}

export interface PayBusiness {
  businessNo?: string
  linkman?: string
  userName?: string
}

export interface PayInvoiceInit {
  businessId?: string
  businessType?: string
  title?: string
  phone?: string
  remark?: string
}

export interface SettlementMethod {
  methodCode?: string
  methodName?: string
  paymentPrice?: number
  [key: string]: any
}

export interface SettlementInitRequest {
  businessId: string
  businessType: string
  bizFlag?: boolean
}

export interface SettlementInitResponse {
  billItems: PayBillItem[]
  business?: PayBusiness
  invoiceInit?: PayInvoiceInit
  settlementMethods: SettlementMethod[]
}

export interface SettlementInvoice {
  title?: string
  bank?: string
  bankAddress?: string
  email?: string
  phone?: string
  taxNo?: string
  remark?: string
}

export interface SettlementRequest {
  businessId: string
  businessType: string
  payItems: PayBillItem[]
  settlementMethods: SettlementMethod[]
  invoiceType?: '2'
  counterId?: string
  settlementInvoice?: SettlementInvoice
}

export interface ThirdPartyPayResponse {
  /**
   * @description 支付渠道 eg: alipay (支付宝)
   */
  channelCode: string
  /**
   * @description 支付方式 eg: ALI_QR（支付宝扫码）
   */
  wayCode: string
  /**
   * @description 流水号
   */
  serialNo: string
  /**
   * @description 支付链接
   */
  qrUrl: string
  pid: string
  payStatus: string
  orderId: string
  /**
   * @description 过期时间 eg: 2025-11-13 17:06:10
   */
  expiredTime: string
  /**
   * @description 金额
   */
  amount: number
  paymentGroupId?: string
  hasElectronicInvoice?: boolean
  invoices?: {
    invoiceId: string
  }[]
}

export interface SettlementResponse<T = any> {
  thirdPartyPay: boolean
  payResponse: T
}

export interface InvoiceListReqeust {
  businessId: string
  businessType: string
}

export interface InvoiceApply {
  invoiceCode?: string
  invoiceNo?: string
  id: string
  invoiceTime?: string
  payInvoiceTime: string
  platform: string
  factPrice: number
  title: string
  businessId: string
  businessType: string
  /**
   * @description 发票状态
   * 1：待开票
   * 2：开票中
   * 3：已开票
   * 6：开票失败
   * 9：需认证
   */
  payTaxInvoiceStatus?: '1' | '2' | '3' | '6' | '9'
}

export interface InvoiceListResponse {
  business?: PayBusiness
  applyList?: InvoiceApply[]
}

export interface PaymentTerminal {
  counterCode: string
  counterName: string
  /**
   * JSON 字符串
   */
  itemConfig?: string
}
