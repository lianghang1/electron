import type { DomainDefinition } from '@shell/shared'
import type { PrintSystem } from './index'
import { z } from 'zod'
import { jobIdInput, listJobsInput, noInput, printSubmitInput } from '../input-schemas'

/** print 域：统一打印（任务簿 + 归档 + 重打）。 */

export function createPrintMethods(print: PrintSystem): DomainDefinition['methods'] {
  return {
    submitPrintJob: {
      input: printSubmitInput,
      output: z.unknown(),
      // 对外契约 printContent/printOptions → PrintRequest payload/options：边界一次转换
      handler: ({ printContent, printOptions }) => print.submitPrintJob({
        payload: printContent,
        options: printOptions,
      }),
    },
    listDevices: {
      input: noInput,
      output: z.unknown(),
      handler: () => print.listDevices(),
    },
    getJobStatus: {
      input: jobIdInput,
      output: z.unknown(),
      handler: ({ printJobId }) => print.getJobStatus(printJobId),
    },
    listPrintJobs: {
      input: listJobsInput,
      output: z.unknown(),
      handler: input => print.listPrintJobs(input?.maxCount),
    },
    removePrintJob: {
      input: jobIdInput,
      output: z.boolean(),
      handler: ({ printJobId }) => print.removePrintJob(printJobId),
    },
    clearPrintJobs: {
      input: noInput,
      output: z.number(),
      handler: () => print.clearPrintJobs(),
    },
    reprintJob: {
      input: jobIdInput,
      output: z.unknown(),
      handler: ({ printJobId }) => print.reprintJob(printJobId),
    },
  }
}
