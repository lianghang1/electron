import type { PrintPayload } from '@shell/shared'
import type { PrintContentContext } from './prepare-print-content'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { preparePrintContent } from './prepare-print-content'

const dir = mkdtempSync(join(tmpdir(), 'print-content-'))
const archiveDir = join(dir, 'archive')

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

function ctx(): PrintContentContext {
  return {
    archiveDir,
    jobId: 'job-1',
    paper: undefined,
    log: () => {},
    allowedOrigins: [],
  }
}

const run = (payload: PrintPayload) => Promise.resolve(preparePrintContent(payload, ctx()))

describe('file 负载统一归档副本化', () => {
  it('归档副本作为 PDF 直通返回值，业务源文件与内容都不变', async () => {
    const source = join(dir, 'business.pdf')
    writeFileSync(source, '%PDF-1.4 original')
    const prepared = await run({ kind: 'file', path: source })
    expect(prepared).toEqual({ type: 'pdf', path: join(archiveDir, 'job-1-source.pdf') })
    expect(existsSync(join(archiveDir, 'job-1-source.pdf'))).toBe(true)
    expect(readFileSync(source, 'utf8')).toBe('%PDF-1.4 original')
    expect(readFileSync(join(archiveDir, 'job-1-source.pdf'), 'utf8')).toBe('%PDF-1.4 original')
  })

  it('图片负载也先复制，查看器 HTML 从副本读取', async () => {
    const source = join(dir, 'photo.png')
    writeFileSync(source, 'PNG-BYTES')
    const prepared = await run({ kind: 'file', path: source })
    expect(prepared.type).toBe('html')
    expect((prepared as { html: string }).html).toContain('data:image/png;base64,')
    expect(existsSync(join(archiveDir, 'job-1-source.png'))).toBe(true)
    expect(readFileSync(source, 'utf8')).toBe('PNG-BYTES')
  })

  it('源文件不存在与不支持的扩展名都给统一校验错误', () => {
    expect(() => preparePrintContent({ kind: 'file', path: join(dir, 'missing.pdf') }, ctx())).toThrow(/文件不存在/)
    const source = join(dir, 'notes.txt')
    writeFileSync(source, 'text')
    expect(() => preparePrintContent({ kind: 'file', path: source }, ctx())).toThrow(/不支持的文件类型/)
  })

  it('html 负载原样返回，不产生归档副本', async () => {
    expect(await run({ kind: 'html', html: '<p>x</p>' })).toEqual({ type: 'html', html: '<p>x</p>' })
    expect(existsSync(join(archiveDir, 'job-1-source.html'))).toBe(false)
  })
})
