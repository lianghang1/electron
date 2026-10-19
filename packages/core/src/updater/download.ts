import type { Buffer } from 'node:buffer'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { net } from 'electron'
import originalFs from 'original-fs'

/** 下载进度推送节流间隔 */
const PROGRESS_THROTTLE_MS = 500

export interface DownloadBundleOptions {
  /** 下载地址 */
  url: string
  /** 落盘目标路径（跟随清单 url 的真实扩展名，zip 容器） */
  target: string
  /** 取消信号：abort 中断下载并清理半成品（抛 AbortError，调用方归入容错路径） */
  signal?: AbortSignal
  /** 进度回调（节流推送；总长未知时 percent 为 -1） */
  onProgress?: (percent: number) => void
}

/**
 * 流式下载热更 zip 包落盘：
 * - 进度经节流回调推送；signal 中断时清理半成品并抛 AbortError
 * - 写盘走 originalFs 绕过 Electron 的 asar 补丁（fs 语义不被劫持）
 */
export async function downloadBundle(options: DownloadBundleOptions): Promise<void> {
  const response = await net.fetch(options.url, { method: 'GET', signal: options.signal })
  if (!response.ok || !response.body) { throw new Error(`asar download failed: ${response.status} ${options.url}`) }

  const total = Number(response.headers.get('content-length') ?? 0)
  await mkdir(path.dirname(options.target), { recursive: true })

  let received = 0
  let lastPush = 0
  const source = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
  source.on('data', (chunk: Buffer) => {
    received += chunk.length
    const now = Date.now()
    if (now - lastPush < PROGRESS_THROTTLE_MS) { return }
    lastPush = now
    options.onProgress?.(total > 0 ? Math.floor((received / total) * 100) : -1)
  })
  try {
    await pipeline(source, originalFs.createWriteStream(options.target), { signal: options.signal })
  }
  catch (error) {
    // 中断 / 失败清理半成品，避免残留垃圾容器
    await rm(options.target, { force: true })
    throw error
  }
}

/** AbortError 判定：主动取消归入容错路径（非错误，状态归位等待下次检查） */
export function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) { return false }
  return error.name === 'AbortError' || (error as NodeJS.ErrnoException).code === 'ABORT_ERR'
}
