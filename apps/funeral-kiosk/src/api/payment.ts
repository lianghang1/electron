import type {
  InvoiceListReqeust,
  InvoiceListResponse,
  PayBillItem,
  PaymentTerminal,
  SettlementInitRequest,
  SettlementInitResponse,
  SettlementMethod,
  SettlementRequest,
  SettlementResponse,
  ThirdPartyPayResponse,
} from './types/payment'
import type { RequestConfig } from '@/http'
import { http } from '@/http'

export default {
  settlementInit: (params: SettlementInitRequest) => {
    return http.Post<SettlementInitResponse>(`/pay/api/sdk/order/init/settlement`, params)
  },
  settlement: <T = any>(params: SettlementRequest) => {
    return http.Post<SettlementResponse<T>>(`/pay/api/sdk/order/settlement`, params)
  },
  getPendingPaymentOrders: (settlementItems: PayBillItem[]) => {
    return http.Post<ThirdPartyPayResponse[]>(`/pay/api/sdk/order/getPendingPaymentOrders`, { payItems: settlementItems })
  },
  closePayOrder: (serialNo: string) => {
    return http.Post(`/pay/api/sdk/order/closePayOrder`, { serialNo })
  },
  getPayOrder: (serialNo: string, config: RequestConfig = {}) => {
    return http.Post<ThirdPartyPayResponse>(`/pay/api/sdk/order/getPayOrder`, { serialNo }, config)
  },
  getSettlementMethods: () => {
    return http.Get<SettlementMethod[]>(`/pay/api/sdk/order/methods`)
  },
  getInvoiceList: (params: InvoiceListReqeust) => {
    return http.Post<InvoiceListResponse>(`/pay/api/sdk/order/invoice/list`, params)
  },
  getTerminals: () => {
    return http.Get<PaymentTerminal[]>(`/pay/api/sdk/payment/info/terminals`)
  },
}
