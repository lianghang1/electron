import type { HiddenWindowPool } from '../hidden-window'
import type { HtmlPdfRenderer } from './no-spool-channel'
import type { PreparedJob } from './prepared-job'
import type { PrintChannel } from './print-channel'
import { loadHtmlInto } from '../hidden-window'
import { withPrintDeadline } from '../operation-deadline'
import { paperToPdfPageSize } from '../paper'
import { IppChannel } from './ipp-channel'
import { NoSpoolChannel } from './no-spool-channel'
import {
  PDF_EXPORT_TIMEOUT_CODE,
  PDF_EXPORT_TIMEOUT_MESSAGE,
  PDF_EXPORT_TIMEOUT_MS,
  pdfMarginsInches,
  resolveEffectiveMargin,
  writePdfArchive,
} from './pdf-export'
import { SystemChannel } from './system-channel'

export interface PrintChannelDeps {
  windows: HiddenWindowPool
  archiveDir: string
  sumatraPath?: string
}

/** 按能力声明装配全部送打实现；新增实现只需在此登记一条并同步 PRINT_CHANNELS。 */
export function buildPrintChannels(deps: PrintChannelDeps): readonly PrintChannel[] {
  const renderer: HtmlPdfRenderer = {
    async render(html: string, job: PreparedJob): Promise<string> {
      return deps.windows.runExclusive('utility', async (win) => {
        await loadHtmlInto(win, html)
        const buffer = await withPrintDeadline(
          win.webContents.printToPDF({
            landscape: job.options.landscape === true,
            printBackground: true,
            preferCSSPageSize: true,
            pageSize: paperToPdfPageSize(job.paper),
            margins: pdfMarginsInches(resolveEffectiveMargin(job)),
          }),
          PDF_EXPORT_TIMEOUT_MS,
          PDF_EXPORT_TIMEOUT_CODE,
          PDF_EXPORT_TIMEOUT_MESSAGE,
        )
        return writePdfArchive(buffer, job.jobId, deps.archiveDir)
      })
    },
  }

  return [
    new SystemChannel(deps.windows, deps.archiveDir, deps.sumatraPath),
    new IppChannel(),
    new NoSpoolChannel('simulated', renderer, deps.archiveDir),
    new NoSpoolChannel('preview', renderer, deps.archiveDir),
    new NoSpoolChannel('dry-run', renderer, deps.archiveDir),
  ]
}
