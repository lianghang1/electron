import type { PrintContentContext } from '../../src/domains/print/prepare-print-content'
import type { RasterizeConfig } from '../../src/domains/print/rasterize/contract'
import { strict as assert } from 'node:assert'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { preparePrintContent } from '../../src/domains/print/prepare-print-content'

/**
 * prepare-print-content 栅格化分支：PDF 直通回归 + 栅格化接线行为。
 * rasterizeToPdf 为注入点，测试用 fake 验证接线（渲染引擎行为由 rasterize/ 集成测试覆盖）。
 */

function makeCtx(dir: string, overrides: Partial<PrintContentContext> = {}): PrintContentContext {
  return {
    archiveDir: dir,
    jobId: 'job-1',
    paper: undefined,
    log: () => {},
    allowedOrigins: [],
    ...overrides,
  }
}

const FAKE_RASTERIZED = new TextEncoder().encode('%PDF-1.4 fake-rasterized')

describe('preparePrintContent：PDF 栅格化分支', () => {
  // 源文件与归档目录分离：归档目录内路径会被 copySourceIntoArchive 直接复用（不产生 -source 副本）
  const root = mkdtempSync(join(tmpdir(), 'ppc-test-'))
  const dir = join(root, 'archive')

  after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('无 rasterize：PDF 直通返回归档路径且内容原样（回归）', async () => {
    const source = join(root, 'in.pdf')
    const bytes = new TextEncoder().encode('%PDF-1.4 original')
    writeFileSync(source, bytes)
    const out = await preparePrintContent({ kind: 'file', path: source }, makeCtx(dir))
    assert.equal(out.type, 'pdf')
    assert.notEqual(out.path, source) // 面向归档副本
    assert.deepEqual(new Uint8Array(readFileSync(out.path)), bytes)
  })

  it('有 rasterize：归档副本覆盖为栅格化产物，返回同一路径', async () => {
    const source = join(root, 'in2.pdf')
    writeFileSync(source, '%PDF-1.4 original')
    const calls: Array<{ bytesLength: number, config: RasterizeConfig }> = []
    const out = await preparePrintContent(
      { kind: 'file', path: source },
      makeCtx(dir, {
        rasterize: { dpi: 150 },
        rasterizeToPdf: async (bytes, config) => {
          calls.push({ bytesLength: bytes.length, config })
          return FAKE_RASTERIZED
        },
      }),
    )
    assert.equal(out.type, 'pdf')
    assert.ok(out.path.startsWith(dir)) // 仍指向归档副本（栅格化产物）
    assert.deepEqual(new Uint8Array(readFileSync(out.path)), FAKE_RASTERIZED)
    // 入参经 assertRasterizeConfig 解析：缺省值补齐（Java Config 字段初始化）
    assert.equal(calls.length, 1)
    assert.equal(calls[0].config.dpi, 150)
    assert.equal(calls[0].config.outputFormat, 'png')
    assert.equal(calls[0].config.orientation, 'portrait')
    assert.equal(calls[0].bytesLength, '%PDF-1.4 original'.length)
  })

  it('有 rasterize 但未装配执行器：CHANNEL_UNAVAILABLE 拒绝', async () => {
    const source = join(root, 'in3.pdf')
    writeFileSync(source, '%PDF-1.4 x')
    await assert.rejects(
      async () => preparePrintContent({ kind: 'file', path: source }, makeCtx(dir, { rasterize: {} })),
      (err: { code?: string }) => err.code === 'CHANNEL_UNAVAILABLE',
    )
  })

  it('rasterize 参数非法：VALIDATION_FAILED（校验在内容准备阶段）', async () => {
    const source = join(root, 'in4.pdf')
    writeFileSync(source, '%PDF-1.4 x')
    await assert.rejects(
      async () => preparePrintContent(
        { kind: 'file', path: source },
        makeCtx(dir, { rasterize: { dpi: 0 }, rasterizeToPdf: async () => FAKE_RASTERIZED }),
      ),
      /DPI 必须在 72-1200/,
    )
    // 校验失败时归档副本不被破坏（先读后写）
    const archived = `${join(dir, 'job-1-source.pdf')}`
    assert.equal(readFileSync(archived, 'utf8'), '%PDF-1.4 x')
  })

  it('html 负载忽略 rasterize', async () => {
    const out = await preparePrintContent(
      { kind: 'html', html: '<p>hi</p>' },
      makeCtx(dir, { rasterize: {} }),
    )
    assert.deepEqual(out, { type: 'html', html: '<p>hi</p>' })
  })

  it('图片负载忽略 rasterize（转查看器 HTML）', async () => {
    const source = join(root, 'in.png')
    writeFileSync(source, 'fake-image-bytes')
    const out = await preparePrintContent(
      { kind: 'file', path: source },
      makeCtx(dir, { rasterize: {}, rasterizeToPdf: async () => FAKE_RASTERIZED }),
    )
    assert.equal(out.type, 'html')
    assert.ok(out.html.includes('data:image/png;base64'))
  })
})
