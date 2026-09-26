import type { FhBusinessConfig, FhInvoice, FhInvoiceTitle, FhOrder, FhPaySession, FhPayStatus, FhQuery } from './funeral'

/**
 * 殡仪馆业务通道契约（App 本地）：Main 侧 createHandle<FhIpc>() 注册，
 * preload 声明白名单，Renderer 侧经 window.desktop.$invoke 由 src/api/fh.ts 收口类型。
 */
export interface FhIpc {
  'fh:config:get': () => FhBusinessConfig
  'fh:order:query': (query: FhQuery) => FhOrder[]
  'fh:pay:create': (orderNo: string) => FhPaySession
  'fh:pay:status': (orderNo: string) => FhPayStatus
  'fh:invoice:list': (query: FhQuery) => FhInvoice[]
  'fh:invoice:issue': (input: { orderNo: string, title: FhInvoiceTitle }) => FhInvoice
}
