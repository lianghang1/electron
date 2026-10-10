import type { PrintOptions } from '@desktop/shared'
import type { ReportReqeust } from '@/api/types/common'
import CommonApi from '@/api/common'
import { httpContext } from '@/http/context'
import { buildUrl } from '@/utils'
import usePrint from './usePrint'

interface TerminalPrintOptions extends PrintOptions {
  paperSize?: string
}

export interface ReportOptions extends ReportReqeust {}
export interface ReportData {
  signature: string
  reportUrl: string
  printOptions: TerminalPrintOptions
}

export default function () {
  const { printPdf } = usePrint()

  const downloadReportSignature = async (signature: string) => {
    return CommonApi.downloadReportSignature(signature)
  }

  const downloadReport = async (options: ReportOptions) => {
    return CommonApi.downloadReport(options)
  }

  const getResportSignature = async (options: ReportOptions): Promise<ReportData> => {
    options.reportType = options.reportType || 'PDF'
    options.extParams = options.extParams || {}
    const data = await CommonApi.getReportSignature(options)
    const reportUrl = buildUrl(`${__VITE_API_BASE_URL__}/report/resource/preview/${data?.signature}`, {
      access_token: httpContext.getTokenValue()!,
    })
    const printOptions = (data?.reportResource?.printConfigObj?.terminal || {}) as TerminalPrintOptions
    return {
      signature: data?.signature || '',
      reportUrl,
      printOptions,
    }
  }

  const printReportPdf = async (options: ReportOptions) => {
    const { reportUrl, printOptions } = await getResportSignature(options)
    printOptions.paper = printOptions.paper || printOptions.paperSize || 'A4'
    const result = await printPdf(reportUrl, printOptions)
    if (!result) {
      throw new Error('打印失败')
    }
    CommonApi.saveReportPrintRecord(options, {
      meta: {
        $toast: false,
      },
    })
    return result
  }

  return {
    getResportSignature,
    printReportPdf,
    downloadReportSignature,
    downloadReport,
  }
}
