export interface ReportReqeust {
  code: string
  reportType?: 'PDF' | 'JPEG'
  extParams?: Record<string, any>
}

export interface ReportSignatureResponse {
  signature: string
  reportResource?: {
    code: string
    name: string
    printConfigObj?: Record<string, any>
  }
}

export interface DecodeQrcodeResponse {
  prefix: string
  value: string
}

export interface FileListResponse {
  isImg: boolean
  thumbFileUrl: string
  fileUrl: string
  accessKey: string
  contentType: string
}
