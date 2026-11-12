import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { archiveFileName, copySourceIntoArchive, isWithinArchive, needsArchiveCopy } from './archive-source'

const dir = mkdtempSync(join(tmpdir(), 'print-archive-'))
const archiveDir = join(dir, 'archive')

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('归档副本文件名与边界', () => {
  it('副本名与任务号绑定并保留小写扩展名', () => {
    expect(archiveFileName('job-1', 'C:/docs/Report.PDF')).toBe('job-1-source.pdf')
    expect(archiveFileName('job-2', '/tmp/photo.PNG')).toBe('job-2-source.png')
    expect(archiveFileName('job-3', '/tmp/plain')).toBe('job-3-source')
  })

  it('只认归档目录内的路径，目录自身与前缀欺骗都不算', () => {
    expect(isWithinArchive(join(archiveDir, 'job-1-source.pdf'), archiveDir)).toBe(true)
    expect(isWithinArchive(join(archiveDir, 'nested', 'job-1-source.pdf'), archiveDir)).toBe(true)
    expect(isWithinArchive(archiveDir, archiveDir)).toBe(false)
    expect(isWithinArchive(join(dir, 'business.pdf'), archiveDir)).toBe(false)
    expect(isWithinArchive(`${archiveDir}-evil/business.pdf`, archiveDir)).toBe(false)
    expect(isWithinArchive(join(archiveDir, '..', 'business.pdf'), archiveDir)).toBe(false)
  })

  it('仅 file 负载需要复制', () => {
    expect(needsArchiveCopy({ kind: 'file', path: '/tmp/a.pdf' })).toBe(true)
    expect(needsArchiveCopy({ kind: 'url', url: 'https://example.com/a.pdf' })).toBe(false)
    expect(needsArchiveCopy({ kind: 'html', html: '<p>x</p>' })).toBe(false)
  })
})

describe('源文件复制进归档目录', () => {
  it('复制出副本、源文件保持不变、返回路径落在归档内', () => {
    const source = join(dir, 'business.pdf')
    writeFileSync(source, '%PDF-1.4 original')
    const archived = copySourceIntoArchive(source, archiveDir, 'job-1')
    expect(archived).toBe(join(archiveDir, 'job-1-source.pdf'))
    expect(isWithinArchive(archived, archiveDir)).toBe(true)
    expect(existsSync(archived)).toBe(true)
    expect(readFileSync(archived, 'utf8')).toBe('%PDF-1.4 original')
    expect(readFileSync(source, 'utf8')).toBe('%PDF-1.4 original')
  })

  it('已在归档目录内的路径直接复用，不重复复制', () => {
    const archived = join(archiveDir, 'job-2-source.pdf')
    writeFileSync(archived, 'archived')
    expect(copySourceIntoArchive(archived, archiveDir, 'job-3')).toBe(archived)
    expect(existsSync(join(archiveDir, 'job-3-source.pdf'))).toBe(false)
  })

  it('源文件无法读取时抛统一校验错误，不留下半成品副本', () => {
    const missing = join(dir, 'missing.pdf')
    expect(() => copySourceIntoArchive(missing, archiveDir, 'job-4')).toThrow(/无法复制/)
    expect(existsSync(join(archiveDir, 'job-4-source.pdf'))).toBe(false)
  })
})
