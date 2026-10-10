import type { DecodeQrcodeResponse, FileListResponse, ReportReqeust, ReportSignatureResponse } from './types/common'
import type { RequestConfig } from '@/http'

import { http } from '@/http'
import { isArray } from '@/utils'

export default {
  getReportSignature: (params: ReportReqeust, config?: RequestConfig) => {
    return http.Post<ReportSignatureResponse>(`/report/resource/signature`, params, config)
  },
  saveReportPrintRecord: (params: ReportReqeust, config?: RequestConfig) => {
    return http.Post(`/report/resource/savePrint`, params, config)
  },
  downloadReportSignature: (signature: string) => {
    return http.Get(`/report/resource/preview/${signature}`, {
      responseType: 'blob',
      meta: {
        $raw: true,
      },
    })
  },
  downloadReport: (params: ReportReqeust, config?: RequestConfig) => {
    return http.Post(`/report/resource/preview`, params, {
      ...config,
      responseType: 'blob',
      meta: {
        $raw: true,
      },
    })
  },
  decodeQrcode: (params: { content: string, bizCodeToId?: boolean }) => {
    return http.Post<DecodeQrcodeResponse>(`/by/api/sdk/qrcode/decode`, params)
  },
  getActivity: (type: string) => {
    return http.Get(`/as/api/sdk/common/getActivity/${type}`)
  },
}

export function getFileList(fileKey: string | string[], expire?: number) {
  let fileKeys = fileKey
  if (isArray(fileKey)) {
    fileKeys = (fileKeys as string[]).join()
  }
  return http.Get<FileListResponse[]>(`/fc/v2/file/list`, {
    cacheFor: {
      expire: expire || -1,
    },
    params: {
      fileKeys,
    },
  })
}
