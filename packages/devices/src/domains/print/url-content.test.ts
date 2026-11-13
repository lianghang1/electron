import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadUrlContent } from './url-content'

const fetchMock = vi.fn()
vi.mock('electron', () => ({
  net: { fetch: (...args: unknown[]) => fetchMock(...args) },
}))

const dir = mkdtempSync(join(tmpdir(), 'print-url-'))
const archiveDir = join(dir, 'archive')

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

function pdfResponse(): { ok: boolean, status: number, headers: { get: (k: string) => string | null }, arrayBuffer: () => Promise<ArrayBuffer> } {
  return {
    ok: true,
    status: 200,
    headers: { get: k => (k === 'content-type' ? 'application/pdf' : null) },
    arrayBuffer: async () => new TextEncoder().encode('%PDF-1.4 remote').buffer as ArrayBuffer,
  }
}

const log = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  log.mockReset()
  fetchMock.mockResolvedValue(pdfResponse())
})

describe('downloadUrlContent（源站白名单与内网策略）', () => {
  it('空白名单拒绝一切远程下载', async () => {
    await expect(downloadUrlContent({ kind: 'url', url: 'https://a.com/report.pdf' }, archiveDir, 'j1', log, []))
      .rejects
      .toThrow(/origin not allowed/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('* 放行公网 URL，产物落在归档目录', async () => {
    const out = await downloadUrlContent({ kind: 'url', url: 'https://a.com/report.pdf' }, archiveDir, 'j2', log, ['*'])
    expect(out.type).toBe('pdf')
    expect(existsSync(out.path)).toBe(true)
    expect(readFileSync(out.path, 'utf8')).toBe('%PDF-1.4 remote')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('* 不放行内网地址（公网通配 ≠ 内网授权），错误提示显式列出主机', async () => {
    await expect(downloadUrlContent({ kind: 'url', url: 'http://192.168.1.10:8080/file.pdf' }, archiveDir, 'j3', log, ['*']))
      .rejects
      .toThrow(/显式加入白名单/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('显式列出内网主机即放行（运维意图），并记 warn 留痕', async () => {
    const origins = ['http://192.168.1.10:8080']
    const out = await downloadUrlContent({ kind: 'url', url: 'http://192.168.1.10:8080/file.pdf' }, archiveDir, 'j4', log, origins)
    expect(out.type).toBe('pdf')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('warn', expect.stringContaining('内网主机'), expect.objectContaining({ origin: 'http://192.168.1.10:8080' }))
  })

  it('显式条目之外的内网主机仍然拒绝', async () => {
    await expect(downloadUrlContent({ kind: 'url', url: 'http://10.0.0.5/file.pdf' }, archiveDir, 'j5', log, ['http://192.168.1.10:8080']))
      .rejects
      .toThrow(/origin not allowed/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('子域通配命中的内网主机视为显式条目放行', async () => {
    const out = await downloadUrlContent({ kind: 'url', url: 'http://print.lan.local/file.pdf' }, archiveDir, 'j6', log, ['*.lan.local'])
    expect(out.type).toBe('pdf')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('拒绝非 http(s) 协议', async () => {
    await expect(downloadUrlContent({ kind: 'url', url: 'file:///etc/passwd' }, archiveDir, 'j7', log, ['*']))
      .rejects
      .toThrow(/protocol/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
