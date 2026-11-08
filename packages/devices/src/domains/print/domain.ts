import type { DomainDefinition } from '@shell/shared'
import type { PrintSystem } from './index'
import { defineDomain } from '@shell/shared'
import { z } from 'zod'

/** print 域：统一打印（任务簿 + 归档 + 重打）。 */
export function createPrintDomain(print: PrintSystem): DomainDefinition {
  return defineDomain('print', {
    submit: {
      input: z.object({}).passthrough(),
      output: z.unknown(),
      handler: input => print.submit(input as never),
    },
    listPrinters: {
      input: z.undefined().optional(),
      output: z.unknown(),
      handler: () => print.listPrinters(),
    },
    status: {
      input: z.object({ jobId: z.string() }),
      output: z.unknown(),
      handler: ({ jobId }) => print.status(jobId),
    },
    listJobs: {
      input: z.object({ limit: z.number().int().positive().optional() }).optional(),
      output: z.unknown(),
      handler: input => print.listJobs(input?.limit),
    },
    removeJob: {
      input: z.object({ jobId: z.string() }),
      output: z.boolean(),
      handler: ({ jobId }) => print.removeJob(jobId),
    },
    clearJobs: {
      input: z.undefined().optional(),
      output: z.number(),
      handler: () => print.clearJobs(),
    },
    reprint: {
      input: z.object({ jobId: z.string() }),
      output: z.unknown(),
      handler: ({ jobId }) => print.reprint(jobId),
    },
  })
}
