import type {
  FhBusinessConfig,
  GetCertificateRequest,
  GetProductListRequest,
  InvoiceListRequest,
  PayBillItem,
  ReportRequest,
  RetailRequest,
  SettlementInitRequest,
  SettlementRequest,
} from '../types/funeral'
import type { FhIpc } from '../types/ipc'

/**
 * 殡仪馆业务 API：window.desktop.$invoke 的类型化收口。
 * channel 拼写受 FhIpc 契约约束，入参与返回值同步受约束；
 * 白名单在 electron/preload/index.ts 声明，两端一致性由 typecheck + 冒烟验证兜底。
 */
function invoke<K extends keyof FhIpc>(
  channel: K,
  ...args: Parameters<FhIpc[K]>
): Promise<Awaited<ReturnType<FhIpc[K]>>> {
  return window.desktop.$invoke(channel, ...args) as Promise<Awaited<ReturnType<FhIpc[K]>>>
}

export const fh = {
  // ===== 配置 =====
  /** 自助机业务配置 */
  getConfig: () => invoke('fh:config:get'),
  /** 更新业务配置（设置面板保存，写回 userData/config.json） */
  updateConfig: (input: Partial<FhBusinessConfig>) => invoke('fh:config:update', input),
  /** 运维授权密码校验（设置面板入口） */
  verifyAuth: (password: string) => invoke('fh:auth:verify', { password }),
  /** 退出自助终端应用 */
  exitApp: () => invoke('fh:app:exit'),
  /** 扫码解码：prefix 决定跳转分发 */
  decodeQrcode: (content: string) => invoke('fh:qrcode:decode', { content }),

  // ===== 支付结算 =====
  /** 结算方式列表 */
  getSettlementMethods: () => invoke('fh:payment:methods'),
  /** 结算初始化：账单明细 + 业务主体 + 开票预填 */
  settlementInit: (input: SettlementInitRequest) => invoke('fh:payment:settlementInit', input),
  /** 提交结算：创建第三方支付单 */
  settlement: (input: SettlementRequest) => invoke('fh:payment:settlement', input),
  /** 查询遗留待支付单（进结算前先关闭，避免重复支付） */
  getPendingPaymentOrders: (payItems: PayBillItem[]) => invoke('fh:payment:pending', payItems),
  /** 轮询支付单状态 */
  getPayOrder: (serialNo: string) => invoke('fh:payment:order', serialNo),
  /** 关闭支付单（取消支付 / 结算前清理） */
  closePayOrder: (serialNo: string) => invoke('fh:payment:close', serialNo),

  // ===== 业务单据 =====
  /** 按证件/条码值反查业务单 businessId */
  getBusinessIdByDeadCert: (value: string) => invoke('fh:business:certQuery', { value }),
  /** 查询电子火化证/寄存证信息 */
  getCertificateInfo: (input: GetCertificateRequest) => invoke('fh:business:certificate', input),

  // ===== 商品零售 =====
  /** 商品列表 */
  getProductList: (input: GetProductListRequest) => invoke('fh:product:list', input),
  /** 提交零售单：返回结算 businessId + businessType */
  retail: (input: RetailRequest) => invoke('fh:product:retail', input),

  // ===== 发票 =====
  /** 发票申请列表（含已开/开票中/待开） */
  getInvoiceList: (input: InvoiceListRequest) => invoke('fh:invoice:list', input),

  // ===== 报表 =====
  /** 打印报表（凭条） */
  printReport: (input: ReportRequest) => invoke('fh:report:print', input),
  /** 导出报表 PDF（base64） */
  downloadReport: (input: ReportRequest) => invoke('fh:report:pdf', input),

  // ===== 班次 =====
  /** 礼厅班次 */
  getHallSchedule: (selectDate: string) => invoke('fh:schedule:hall', { selectDate }),
  /** 火化班次 */
  getCremationSchedule: (selectDate: string) => invoke('fh:schedule:cremation', { selectDate }),
}
