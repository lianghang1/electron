/**
 * 殡仪馆自助终端（apps/funeral）业务类型：App 本地，不进平台包（@desktop/shared）。
 *
 * 字段名与殡仪馆业务系统接口对齐（参考 electron-funeral-sst），Main 侧 mock 的
 * 返回形态即真实后端形态，对接时仅替换 business.ts 实现，本文件与页面不动。
 */

// ===== 业务配置 =====

/** 自助机业务配置：部署时按机器写 userData/config.json 覆盖默认值 */
export interface FhBusinessConfig {
  /** 机器编号（运维定位 / 监控标识，同时作为结算 counterId） */
  machineId: string
  /** 馆名（页眉展示） */
  hallName: string
  /** 结算柜台名称（零售单 counterName） */
  counterName: string
  /** 院内服务器地址（热更 feed / 上报，未配置用构建内置默认） */
  serverUrl?: string
}

// ===== 支付结算（对应参考 /pay/api/sdk/*）=====

/** 结算单明细行 */
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
  /** 分组：1 行政事业 / 2 殡仪服务 / 3 经营服务 */
  groupId?: string
}

/** 结算业务单主体信息 */
export interface PayBusiness {
  businessNo?: string
  /** 经办人 */
  linkman?: string
  /** 逝者姓名 */
  userName?: string
}

/** 结算开票预填信息 */
export interface PayInvoiceInit {
  businessId?: string
  businessType?: string
  title?: string
  phone?: string
  remark?: string
}

/** 结算方式（微信/支付宝等，renderer 渲染选择卡） */
export interface SettlementMethod {
  methodCode?: string
  methodName?: string
  paymentPrice?: number
  /** 展示配置：icon / color / code */
  extendData?: SettlementMethodExtend
}

export interface SettlementMethodExtend {
  icon?: string
  color?: string
  code?: string
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

/** 结算时随单提交的发票抬头信息 */
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
  /** 电子发票标识 */
  invoiceType?: '2'
  /** 自助机编号 */
  counterId?: string
  settlementInvoice?: SettlementInvoice
}

/** 第三方支付单（二维码 / 轮询状态载体） */
export interface ThirdPartyPayResponse {
  /** 支付渠道 eg: alipay */
  channelCode: string
  /** 支付方式 eg: ALI_QR */
  wayCode: string
  /** 流水号 */
  serialNo: string
  /** 支付链接（渲染二维码） */
  qrUrl: string
  pid: string
  /** 支付状态：'0'/'1' 处理中，'2' 成功 */
  payStatus: string
  orderId: string
  /** 过期时间 eg: 2026-09-26 17:06:10 */
  expiredTime: string
  /** 金额（元） */
  amount: number
  paymentGroupId?: string
  hasElectronicInvoice?: boolean
  invoices?: { invoiceId: string }[]
}

export interface SettlementResponse {
  thirdPartyPay: boolean
  payResponse: ThirdPartyPayResponse
}

// ===== 发票（对应参考 /pay/api/sdk/order/invoice/*）=====

export interface InvoiceListRequest {
  businessId: string
  businessType: string
}

/** 发票申请记录 */
export interface InvoiceApply {
  invoiceCode?: string
  invoiceNo?: string
  id: string
  invoiceTime?: string
  /** 缴费开票申请时间 */
  payInvoiceTime: string
  /** 开票平台 */
  platform: string
  /** 实收金额（元） */
  factPrice: number
  /** 抬头名称 */
  title: string
  businessId: string
  businessType: string
  /** 发票状态：1 待开票 / 2 开票中 / 3 已开票 / 6 开票失败 / 9 需认证 */
  payTaxInvoiceStatus?: '1' | '2' | '3' | '6' | '9'
}

export interface InvoiceListResponse {
  business?: PayBusiness
  applyList?: InvoiceApply[]
}

/** 结算终端（真实部署可扩展，mock 用 config 合成） */
export interface PaymentTerminal {
  counterCode: string
  counterName: string
  /** JSON 字符串 */
  itemConfig?: string
}

// ===== 业务单据（对应参考 /by/api/sdk/business/*）=====

export interface GetCertificateRequest {
  bizId: string
  /** 02 火化证 / 03 寄存证 */
  type: '02' | '03'
}

export interface GetCertificateResponse {
  bizId: string
  certificateNo: string
  issueDate: string
  status?: string
}

// ===== 商品零售（对应参考 /product/api/sdk/*）=====

export interface ProductItem {
  itemId: string
  itemType: string
  itemName: string
  pic?: string
  albumPics?: string[]
  content?: string
  sortId: string
  spec?: string
  unit?: string
  price: number
  storeId?: string
  storeName?: string
  remark?: string
  realPrice: number
  qty?: number
  sumPrice?: number
}

export interface GetProductListRequest {
  orderBy?: string
  onlineFlag?: boolean
  filterCode?: string
  productItemTypes?: { itemType?: string, sortId?: string, productId?: string }[]
}

export interface RetailItem {
  itemId: string
  itemType: string
  itemName: string
  qty: number
  price: number
  sortId?: string
  itemPic?: string
  itemUnit?: string
  itemSpec?: string
  specialType?: string
  storeId?: string
}

export interface RetailRequest {
  /** 1 殡仪 / 2 零售 / 3 寄存 */
  businessSource?: '1' | '2' | '3'
  mobileNo?: string
  counterName: string
  items: RetailItem[]
}

export interface RetailResponse {
  /** 零售单 businessId（进入结算） */
  id: string
  /** 结算业务类型（进入结算 businessType） */
  payBusinessType: string
}

// ===== 通用 =====

/** 报表请求（打印凭条 / 导出 PDF） */
export interface ReportRequest {
  /** 报表编码 eg: PaymentFinishBean / paymentInvoice / commonCremationCertificate */
  code: string
  reportType?: 'PDF' | 'JPEG'
  extParams?: Record<string, string>
}

/** 扫码解码结果：prefix 决定跳转分发（PB 结算业务 / dzhhz 电子火化证 / NPE 业务码） */
export interface DecodeQrcodeResponse {
  prefix: string
  value: string
}

// ===== 班次（对应参考 /by/api/sdk/bbs/*）=====

export interface ScheduleBizInfo {
  name?: string
  businessNo?: string
}

/** 礼厅班次：按礼厅分列 */
export interface HallScheduleResponse {
  list: {
    name: string
    schedules: {
      id: string
      startTime: string
      endTime: string
      bizInfo?: ScheduleBizInfo[]
    }[]
  }[]
}

/** 火化班次：按炉具分组 */
export interface CremationScheduleResponse {
  list: {
    extend?: { startTime: string, endTime: string }
    schedules: {
      id: string
      bizInfo?: ScheduleBizInfo[]
    }[]
  }[]
}
