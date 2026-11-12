import type { UnifiedPrinter } from '@shell/shared'
import type { PreparedJob } from './prepared-job'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { HiddenWindowPool } from '../hidden-window'
import { SystemChannel } from './system-channel'

const h = vi.hoisted(() => ({
  spawn: vi.fn(),
  isWindowsHost: vi.fn(),
  loadFile: vi.fn(async () => {}),
  executeJavaScript: vi.fn(async () => {}),
}))

vi.mock('node:child_process', () => ({ spawn: (...args: unknown[]) => h.spawn(...args) }))
vi.mock('../../platform', () => ({ isWindowsHost: () => h.isWindowsHost() }))
vi.mock('../hidden-window', () => ({
  HiddenWindowPool: class {
    async runExclusive<T>(_target: unknown, fn: (win: unknown) => Promise<T>): Promise<T> {
      return fn({ loadFile: h.loadFile, webContents: { executeJavaScript: h.executeJavaScript } })
    }

    async withUtility<T>(fn: (win: unknown) => Promise<T>): Promise<T> {
      return fn({})
    }

    destroyAll(): void {}
  },
  loadHtmlInto: async () => {},
  webContentsPrint: async () => {},
}))

const dir = mkdtempSync(join(tmpdir(), 'system-channel-'))
const archiveDir = join(dir, 'archive')
const pdfFile = join(dir, 'doc.pdf')
const exeFile = join(dir, 'SumatraPDF.exe')
writeFileSync(pdfFile, '%PDF-1.4 test')
writeFileSync(exeFile, 'exe-stub')

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

class FakeChild extends EventEmitter {
  readonly stderr = new EventEmitter()
  kill(): void {}
}

function fakeChild(code: number, stderr = ''): FakeChild {
  const child = new FakeChild()
  queueMicrotask(() => {
    if (stderr) { child.stderr.emit('data', stderr) }
    child.emit('close', code)
  })
  return child
}

const printer: UnifiedPrinter = {
  id: 'PRINTER',
  displayName: 'PRINTER',
  source: 'system',
  isDefault: true,
  status: 'unknown',
  capabilities: {},
  meta: {},
}

function pdfJob(): PreparedJob {
  return {
    jobId: 'job-1',
    jobName: 'order-1',
    options: { paper: 'A4' },
    content: { type: 'pdf', path: pdfFile },
  }
}

const windows = new HiddenWindowPool()
const detailOf = (outcome: { detail?: unknown }): { via: string } => outcome.detail as { via: string }

beforeEach(() => {
  for (const fn of [h.spawn, h.isWindowsHost, h.loadFile, h.executeJavaScript]) { fn.mockClear() }
})

describe('pdf 直通的三条真实送打路径', () => {
  it('已就位 SumatraPDF 时走 -print-to 静默送打并回传参数审计', async () => {
    h.isWindowsHost.mockReturnValue(true)
    h.spawn.mockImplementation(() => fakeChild(0))
    const outcome = await new SystemChannel(windows, archiveDir, exeFile).execute(pdfJob(), printer)
    expect(h.spawn).toHaveBeenCalledTimes(1)
    const [cmd, args] = h.spawn.mock.calls[0] as [string, string[]]
    expect(cmd).toBe(exeFile)
    expect(args).toEqual(['-print-to', 'PRINTER', '-silent', '-print-settings', 'fit', pdfFile])
    expect(detailOf(outcome).via).toBe('SumatraPDF')
    expect(outcome.archivedPdfPath).toBe(pdfFile)
  })

  it('没有 SumatraPDF 时退回 Chromium PDF 插件窗口', async () => {
    h.isWindowsHost.mockReturnValue(true)
    h.spawn.mockImplementation(() => fakeChild(0))
    const outcome = await new SystemChannel(windows, archiveDir).execute(pdfJob(), printer)
    expect(h.loadFile).toHaveBeenCalledWith(pdfFile)
    expect(h.executeJavaScript).toHaveBeenCalled()
    expect(h.spawn).not.toHaveBeenCalled()
    expect(detailOf(outcome).via).toBe('chromium-pdf-plugin')
  })

  it('macOS / Linux / 国产化系统：走 CUPS lp', async () => {
    h.isWindowsHost.mockReturnValue(false)
    h.spawn.mockImplementation(() => fakeChild(0))
    const outcome = await new SystemChannel(windows, archiveDir).execute(pdfJob(), printer)
    expect(h.spawn).toHaveBeenCalledTimes(1)
    const [cmd, args] = h.spawn.mock.calls[0] as [string, string[]]
    expect(cmd).toBe('lp')
    expect(args.slice(0, 2)).toEqual(['-d', 'PRINTER'])
    expect(args.slice(-1)).toEqual([pdfFile])
    expect(detailOf(outcome).via).toBe('cups-lp')
  })

  it('送打失败按退出码收敛为统一错误码', async () => {
    h.isWindowsHost.mockReturnValue(true)
    h.spawn.mockImplementation(() => fakeChild(4))
    await expect(new SystemChannel(windows, archiveDir, exeFile).execute(pdfJob(), printer))
      .rejects
      .toMatchObject({ code: 'PRINTER_NOT_FOUND' })
  })

  it('非系统来源打印机被拒绝', async () => {
    h.isWindowsHost.mockReturnValue(false)
    const other: UnifiedPrinter = { ...printer, source: 'ipp' }
    await expect(new SystemChannel(windows, archiveDir).execute(pdfJob(), other))
      .rejects
      .toMatchObject({ code: 'VALIDATION_FAILED' })
  })
})
