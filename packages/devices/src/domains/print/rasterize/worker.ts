import type { PDFiumLibrary } from '@hyzyla/pdfium/inline'
import type { HostError, HostRequest, HostResponse } from '../../../host/protocol'
import process from 'node:process'
import { assertRasterizeConfig } from './contract'
import { createPdfiumLibrary, rasterizePdf } from './engine'
import { assemblePdf } from './repaper'

/**
 * 栅格化守护进程入口（utilityProcess fork 的目标 bundle，out/main/rasterize-worker.js）：
 * PDFium WASM 与 pdf-lib 的 CPU 密集渲染收敛在本进程，崩溃不影响主进程。
 * 与 device-host 并列独立成进程：wasm 渲染的崩溃模式（OOM/特定文档）与 koffi 设备调用互不牵连。
 */

/** 进程内共享 pdfium 实例：wasm 初始化一次，跨请求复用 */
let library: PDFiumLibrary | undefined

interface RasterizePayload {
  bytes: Uint8Array
  /** 未校验的 rasterize 入参，worker 侧独立校验（主进程侧契约与实现不同步时双保险） */
  config: unknown
}

async function toPdf(payload: RasterizePayload): Promise<{ pdf: Uint8Array }> {
  const config = assertRasterizeConfig(payload.config)
  library ??= await createPdfiumLibrary()
  const pages = await rasterizePdf(library, payload.bytes, config)
  return { pdf: await assemblePdf(pages) }
}

// 与 host/run.ts 的 toHostError 同构但独立复制：import run.ts 会把 device-host 的全部域驱动
// （koffi 厂商 DLL）拉进栅格化 bundle，两进程 bundle 必须互不牵连
function toHostError(err: unknown): HostError {
  const carrier = err as { name?: unknown, code?: unknown, detail?: unknown } | null
  return {
    name: err instanceof Error ? err.name : typeof err,
    code: typeof carrier?.code === 'string' ? carrier.code : 'UNKNOWN',
    message: err instanceof Error ? err.message : String(err),
    detail: carrier?.detail,
  }
}

process.parentPort.on('message', (event) => {
  const req = event.data as HostRequest
  void (async () => {
    try {
      const result = await toPdf(req.payload as RasterizePayload)
      process.parentPort.postMessage({ id: req.id, result } satisfies HostResponse)
    }
    catch (err) {
      process.parentPort.postMessage({ id: req.id, error: toHostError(err) } satisfies HostResponse)
    }
  })()
})
