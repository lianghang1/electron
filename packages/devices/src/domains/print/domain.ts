import type { DomainDefinition } from '@shell/shared'
import type { PrintSystem } from './index'
import { defineDomain } from '@shell/shared'
import { z } from 'zod'
import { jobIdInput, listJobsInput, noInput, printSubmitInput } from '../input-schemas'

/** print 域：统一打印（任务簿 + 归档 + 重打）。 */
export function createPrintDomain(print: PrintSystem): DomainDefinition {
  return defineDomain('print', {
    submitPrintJob: {
      input: printSubmitInput,
      output: z.unknown(),
      handler: input => print.submit(input),
    },
    listDevices: {
      input: noInput,
      output: z.unknown(),
      handler: () => print.listPrinters(),
    },
    getJobStatus: {
      input: jobIdInput,
      output: z.unknown(),
      handler: ({ jobId }) => print.status(jobId),
    },
    listPrintJobs: {
      input: listJobsInput,
      output: z.unknown(),
      handler: input => print.listJobs(input?.limit),
    },
    removePrintJob: {
      input: jobIdInput,
      output: z.boolean(),
      handler: ({ jobId }) => print.removeJob(jobId),
    },
    clearPrintJobs: {
      input: noInput,
      output: z.number(),
      handler: () => print.clearJobs(),
    },
    reprintJob: {
      input: jobIdInput,
      output: z.unknown(),
      handler: ({ jobId }) => print.reprint(jobId),
    },
  })
}
