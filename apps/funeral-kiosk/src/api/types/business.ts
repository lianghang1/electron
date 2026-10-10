export interface GetCertificateRequest {
  bizId: string
  type: '02' | '03'
}

export interface GetCertificateResponse {
  bizId: string
  certificateNo: string
  issueDate: string
  status?: string
}
