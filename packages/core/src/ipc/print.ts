import type { PrintSystem } from '../devices/print'
import { handle } from './handle'

export interface PrintIpcDeps {
  /** 打印系统（bootstrap 装配，恒创建） */
  print: PrintSystem
}

/**
 * print 域通道注册：统一打印。submit 永不 reject，失败以 PrintResult.error 字段回传。
 */
export function registerPrintIpc(deps: PrintIpcDeps): void {
  handle('print:submit', (_e, request) => deps.print.submit(request))
  handle('print:listPrinters', () => deps.print.listPrinters())
  handle('print:status', (_e, jobId) => deps.print.status(jobId))
  handle('print:listJobs', (_e, limit) => deps.print.listJobs(limit))
  handle('print:removeJob', (_e, jobId) => deps.print.removeJob(jobId))
  handle('print:clearJobs', () => deps.print.clearJobs())
  handle('print:renderPreview', (_e, templateId, data, paper) => deps.print.renderPreview(templateId, data, paper))
  handle('print:reprint', (_e, jobId) => deps.print.reprint(jobId))
}
