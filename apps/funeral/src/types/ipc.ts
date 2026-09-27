import type {
  CremationScheduleResponse,
  DecodeQrcodeResponse,
  FhBusinessConfig,
  GetCertificateRequest,
  GetCertificateResponse,
  GetProductListRequest,
  HallScheduleResponse,
  InvoiceListRequest,
  InvoiceListResponse,
  PayBillItem,
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
} from './funeral'

/**
 * 殡仪馆业务通道契约（App 本地）：Main 侧 createHandle<FhIpc>() 注册，
 * preload 声明白名单，Renderer 侧经 window.desktop.$invoke 由 src/api/fh.ts 收口类型。
 *
 * 命名对齐参考项目接口分组：qrcode / payment / business / product / invoice / report / schedule。
 */
// antfu 的 consistent-type-definitions 会把 type alias 转成 interface，
// interface 无隐式索引签名会导致 createHandle 契约约束失效
// eslint-disable-next-line ts/consistent-type-definitions
export type FhIpc = {
  /** 自助机业务配置（userData/config.json 覆盖后的合成值） */
  'fh:config:get': () => FhBusinessConfig
  /** 扫码解码：prefix 决定跳转分发 */
  'fh:qrcode:decode': (input: { content: string, bizCodeToId?: boolean }) => DecodeQrcodeResponse

  /** 结算方式列表 */
  'fh:payment:methods': () => SettlementMethod[]
  /** 结算初始化：账单明细 + 业务主体 + 开票预填 */
  'fh:payment:settlementInit': (input: SettlementInitRequest) => SettlementInitResponse
  /** 提交结算：创建第三方支付单 */
  'fh:payment:settlement': (input: SettlementRequest) => SettlementResponse
  /** 查询遗留待支付单（进结算前先关闭，避免重复支付） */
  'fh:payment:pending': (payItems: PayBillItem[]) => ThirdPartyPayResponse[]
  /** 轮询支付单状态 */
  'fh:payment:order': (serialNo: string) => ThirdPartyPayResponse
  /** 关闭支付单（取消支付 / 结算前清理） */
  'fh:payment:close': (serialNo: string) => void

  /** 按证件/条码值反查业务单 businessId */
  'fh:business:certQuery': (input: { value: string, day?: number }) => string
  /** 查询电子火化证/寄存证信息 */
  'fh:business:certificate': (input: GetCertificateRequest) => GetCertificateResponse

  /** 商品列表 */
  'fh:product:list': (input: GetProductListRequest) => ProductItem[]
  /** 提交零售单：返回结算 businessId + businessType */
  'fh:product:retail': (input: RetailRequest) => RetailResponse

  /** 发票申请列表（含已开/开票中/待开） */
  'fh:invoice:list': (input: InvoiceListRequest) => InvoiceListResponse

  /** 打印报表（凭条，mock 记日志 + 延时） */
  'fh:report:print': (input: ReportRequest) => void
  /** 导出报表 PDF（base64） */
  'fh:report:pdf': (input: ReportRequest) => string

  /** 礼厅班次（selectDate：YYYY-MM-DD） */
  'fh:schedule:hall': (input: { selectDate: string }) => HallScheduleResponse
  /** 火化班次（selectDate：YYYY-MM-DD） */
  'fh:schedule:cremation': (input: { selectDate: string }) => CremationScheduleResponse
}
