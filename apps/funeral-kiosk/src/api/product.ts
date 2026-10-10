import type { GetProductListRequest, ProductItem, RetailRequest, RetailResponse } from './types/product'
import type { RequestConfig } from '@/http'

import { http } from '@/http'

export default {
  getList: (params: GetProductListRequest, config?: RequestConfig) => {
    return http.Post<ProductItem[]>('/product/api/sdk/product/list', params, config)
  },
  getDetail: (itemId: string, itemType: string, config?: RequestConfig) => {
    return http.Post<ProductItem>(`/product/api/sdk/product/detail`, { itemId, itemType }, config)
  },
  retail: (params: RetailRequest, config?: RequestConfig) => {
    return http.Post<RetailResponse>(`/product/api/sdk/product/retail`, params, config)
  },
}
