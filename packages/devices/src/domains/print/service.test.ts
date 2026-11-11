import type { PrintOptions, PrintRequest } from '@shell/shared'
import { Buffer } from 'node:buffer'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { HiddenWindowPool } from './hidden-window'
import { PrinterRegistry } from './printer-registry'
import { PrintService } from './service'

vi.mock('./hidden-window', () => {
  const fakeWindow = {
    webContents: {
      printToPDF: async () => Buffer.from('%PDF-1.4 stub'),
      print: async () => {},
      getPrintersAsync: async () => [],
    },
  }
  return {
    HiddenWindowPool: class {
      runExclusive<T>(_target: unknown, fn: (win: unknown) => Promise<T>): Promise<T> {
        return fn(fakeWindow)
      }

      withUtility<T>(fn: (win: unknown) => Promise<T>): Promise<T> {
        return fn(fakeWindow)
      }

      destroyAll(): void {}
    },
    loadHtmlInto: async (): Promise<void> => {},
    webContentsPrint: async (): Promise<void> => {},
  }
})

vi.mock('./system-default', () => ({
  detectSystemDefaultPrinter: async (): Promise<string | null> => null,
  detectPrinterPapers: async (): Promise<readonly unknown[]> => [],
  detectPrinterHardware: async (): Promise<null> => null,
}))

const dir = mkdtempSync(join(tmpdir(), 'print-service-'))
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

let seq = 0
function makeService(): PrintService {
  const windows = new HiddenWindowPool()
  const registry = new PrinterRegistry(windows)
  const name = `case-${++seq}`
  return new PrintService(windows, registry, {
    archiveDir: join(dir, `${name}-archive`),
    jobsFile: join(dir, `${name}-jobs.json`),
    allowedOrigins: [],
    logger: () => {},
  })
}

function htmlRequest(extra: Partial<PrintOptions> = {}): PrintRequest {
  return {
    payload: { kind: 'html', html: '<h1>test</h1>' },
    options: { ...extra, paper: 'A4' },
  }
}

describe('统一打印服务全链路', () => {
  it('preview 模式只出 PDF 不送打，任务状态可回读', async () => {
    const service = makeService()
    const result = await service.submit(htmlRequest({ preview: true }))
    expect(result.channel).toBe('preview')
    expect(result.mode).toBe('preview')
    expect(result.archivedPdfPath).toBeTruthy()
    expect(existsSync(result.archivedPdfPath ?? '')).toBe(true)
    const status = await service.status(result.jobId)
    expect(status?.state).toBe('done')
    expect(status?.result?.mode).toBe('preview')
    expect(typeof status?.elapsedMs).toBe('number')
  })

  it('dryRun 模式回传将送打参数快照', async () => {
    const service = makeService()
    const result = await service.submit(htmlRequest({ dryRun: true }))
    expect(result.mode).toBe('dry-run')
    const detail = result.detail as { willSpool: boolean, spoolPlan: { targetChannel: string } }
    expect(detail.willSpool).toBe(false)
    expect(detail.spoolPlan.targetChannel).toBe('system')
    expect(result.remoteJob).toBeUndefined()
  })

  it('simulated 通道可切换送打，落审计并回报 done', async () => {
    const service = makeService()
    const result = await service.submit(htmlRequest({ channel: 'simulated' }))
    expect(result.channel).toBe('simulated')
    expect(result.mode).toBe('simulated')
    expect(result.remoteJob?.state).toBe('done')
    const detail = result.detail as { auditFile: string }
    expect(existsSync(detail.auditFile)).toBe(true)
    const audit = JSON.parse(readFileSync(detail.auditFile, 'utf8')) as { jobId: string }
    expect(audit.jobId).toBe(result.jobId)
    const status = await service.status(result.jobId)
    expect(status?.remoteState).toBe('done')
  })

  it('显式 channel 优先于便捷开关', async () => {
    const service = makeService()
    const result = await service.submit(htmlRequest({ channel: 'simulated', preview: true, dryRun: true }))
    expect(result.channel).toBe('simulated')
    expect(result.mode).toBe('simulated')
  })

  it('system 通道在无系统打印机时明确报错并落失败任务簿', async () => {
    const service = makeService()
    await expect(service.submit(htmlRequest({ channel: 'system' }))).rejects.toThrow(/打印机/)
    const jobs = service.listJobs()
    expect(jobs).toHaveLength(1)
    expect(jobs[0].state).toBe('failed')
    expect(jobs[0].error?.code).toBe('PRINTER_DEFAULT_MISSING')
  })

  it('未知通道给出明确错误', async () => {
    const service = makeService()
    await expect(service.submit(htmlRequest({ channel: 'nope' as PrintOptions['channel'] }))).rejects.toThrow(/未知通道/)
  })

  it('并发提交多个 preview 全部完成且任务号唯一', async () => {
    const service = makeService()
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => service.submit(htmlRequest({ preview: true, jobName: `p-${i}` }))),
    )
    expect(new Set(results.map(r => r.jobId)).size).toBe(5)
    for (const r of results) {
      expect(r.mode).toBe('preview')
      expect(existsSync(r.archivedPdfPath ?? '')).toBe(true)
    }
    expect(service.listJobs()).toHaveLength(5)
  })

  it('不存在的任务状态返回 null', async () => {
    const service = makeService()
    expect(await service.status('missing')).toBeNull()
  })
})
