import type { GetCertificateRequest, GetCertificateResponse } from '@/api/types/business'

import type { RequestConfig } from '@/http'

import { http } from '@/http'

export default {
  getBusinessIdByDeadCert: (params: { value: string, day?: number }, config: RequestConfig = {}) => {
    return http.Post<string>(`/by/api/sdk/business/getBusinessIdByDeadCert`, params, config)
  },
  getCertificateInfo: (params: GetCertificateRequest, config: RequestConfig = {}) => {
    return http.Post<GetCertificateResponse>(`/by/api/sdk/business/certificate/info`, params, config)
  },
}
