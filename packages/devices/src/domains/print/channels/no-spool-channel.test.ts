import type { HtmlPdfRenderer } from './no-spool-channel'
import type { PreparedJob } from './prepared-job'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { virtualPrinter } from '../printer-name'
import { NoSpoolChannel } from './no-spool-channel'

const dir = mkdtempSync(join(tmpdir(), 'print-nospool-'))
const sourcePdf = join(dir, 'source.pdf')
writeFileSync(sourcePdf, '%PDF-1.4 stub')

const renderer: HtmlPdfRenderer = {
  async render(html: string, job: PreparedJob): Promise<string> {
    const target = join(dir, `${job.jobId}.pdf`)
    writeFileSync(target, `%PDF-1.4 ${html.length}`)
    return target
  },
}

function pdfJob(jobId: string): PreparedJob {
  return {
    jobId,
    jobName: `job-${jobId}`,
    options: { paper: 'A4', copies: 2 },
    content: { type: 'pdf', path: sourcePdf },
  }
}

function htmlJob(jobId: string): PreparedJob {
  return {
    jobId,
    jobName: `job-${jobId}`,
    options: { paper: 'A4' },
    content: { type: 'html', html: '<h1>hello</h1>' },
  }
}

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('无硬件打印通道', () => {
  it('preview 只出 PDF 不送打，回传归档路径', async () => {
    const channel = new NoSpoolChannel('preview', renderer, dir)
    const outcome = await channel.execute(pdfJob('preview-1'), virtualPrinter())
    expect(outcome.archivedPdfPath).toBe(join(dir, 'preview-1.pdf'))
    expect(existsSync(outcome.archivedPdfPath ?? '')).toBe(true)
    expect((outcome.detail as { mode: string }).mode).toBe('preview')
    expect(outcome.remoteJob).toBeUndefined()
  })

  it('dry-run 回传将送打参数快照且不送打', async () => {
    const channel = new NoSpoolChannel('dry-run', renderer, dir)
    const outcome = await channel.execute(pdfJob('dry-1'), virtualPrinter())
    const detail = outcome.detail as {
      willSpool: boolean
      spoolPlan: { targetChannel: string, contentType: string, printerSource: string }
    }
    expect(detail.willSpool).toBe(false)
    expect(detail.spoolPlan.targetChannel).toBe('system')
    expect(detail.spoolPlan.contentType).toBe('pdf')
  })

  it('simulated 落盘审计并上报 done', async () => {
    const channel = new NoSpoolChannel('simulated', renderer, dir)
    const outcome = await channel.execute(htmlJob('sim-1'), virtualPrinter())
    const detail = outcome.detail as { mode: string, auditFile: string }
    expect(detail.mode).toBe('simulated')
    expect(existsSync(detail.auditFile)).toBe(true)
    const audit = JSON.parse(readFileSync(detail.auditFile, 'utf8')) as { jobId: string }
    expect(audit.jobId).toBe('sim-1')
    expect(outcome.remoteJob?.state).toBe('done')
  })

  it('三种通道都声明不占用物理打印机，且 descriptorId 与 id 一致', () => {
    for (const id of ['simulated', 'preview', 'dry-run'] as const) {
      const channel = new NoSpoolChannel(id, renderer, dir)
      expect(channel.spools).toBe(false)
      expect(channel.descriptorId).toBe(id)
    }
  })

  it('hTML 内容走渲染器生成归档 PDF', async () => {
    const channel = new NoSpoolChannel('preview', renderer, dir)
    const outcome = await channel.execute(htmlJob('html-1'), virtualPrinter())
    const content = readFileSync(outcome.archivedPdfPath ?? '', 'utf8')
    expect(content).toContain(String('<h1>hello</h1>'.length))
  })
})
