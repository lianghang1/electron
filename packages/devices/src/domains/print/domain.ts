import type { DomainDefinition } from '@shell/shared'
import type { PrintSystem } from './index'
import { defineDomain } from '@shell/shared'
import { z } from 'zod'
import { jobIdInput, listJobsInput, noInput, printSubmitInput } from '../input-schemas'

/** print 域：统一打印（任务簿 + 归档 + 重打）。 */
export function createPrintDomain(print: PrintSystem): DomainDefinition {
  return defineDomain('print', {
    submit: {
      input: printSubmitInput,
      output: z.unknown(),
      handler: input => print.submit(input),
    },
    listPrinters: {
      input: noInput,
      output: z.unknown(),
      handler: () => print.listPrinters(),
    },
    status: {
      input: jobIdInput,
      output: z.unknown(),
      handler: ({ jobId }) => print.status(jobId),
    },
    listJobs: {
      input: listJobsInput,
      output: z.unknown(),
      handler: input => print.listJobs(input?.limit),
    },
    removeJob: {
      input: jobIdInput,
      output: z.boolean(),
      handler: ({ jobId }) => print.removeJob(jobId),
    },
    clearJobs: {
      input: noInput,
      output: z.number(),
      handler: () => print.clearJobs(),
    },
    reprint: {
      input: jobIdInput,
      output: z.unknown(),
      handler: ({ jobId }) => print.reprint(jobId),
    },
  })
}
