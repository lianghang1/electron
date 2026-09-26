import type { FhInvoiceTitle, FhQuery } from '../types/funeral'
import type { FhIpc } from '../types/ipc'

/**
 * 殡仪馆业务 API：window.desktop.$invoke 的类型化收口。
 * channel 拼写受 FhIpc 契约约束，入参与返回值同步受约束；
 * 白名单在 electron/preload/index.ts 声明，两端一致性由冒烟验证兜底。
 */
function invoke<K extends keyof FhIpc>(
  channel: K,
  ...args: Parameters<FhIpc[K]>
): Promise<Awaited<ReturnType<FhIpc[K]>>> {
  return window.desktop.$invoke(channel, ...args) as Promise<Awaited<ReturnType<FhIpc[K]>>>
}

export const fh = {
  /** 业务配置（userData/config.json 覆盖后的合成值） */
  getConfig: () => invoke('fh:config:get'),
  /** 按业务单条码或身份证查询业务单（代收费） */
  queryOrders: (query: FhQuery) => invoke('fh:order:query', query),
  /** 创建支付会话（返回二维码内容与有效期） */
  createPay: (orderNo: string) => invoke('fh:pay:create', orderNo),
  /** 轮询支付状态 */
  payStatus: (orderNo: string) => invoke('fh:pay:status', orderNo),
  /** 按业务单条码或身份证查询已开发票 */
  listInvoices: (query: FhQuery) => invoke('fh:invoice:list', query),
  /** 为业务单开发票 */
  issueInvoice: (input: { orderNo: string, title: FhInvoiceTitle }) => invoke('fh:invoice:issue', input),
}
