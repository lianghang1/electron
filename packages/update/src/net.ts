import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

/**
 * 更新公共设施：断点续传下载 + sha256 校验。
 * 铁验收：任何中断（断电/断网/进程被杀）后，下次启动必须落在可运行版本——
 * 一切写入先进 staging 目录，校验通过才原子 rename 进正式位。
 */

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

/** 断点续传下载：服务端须支持 Range；不支持或起点不符则整文件重下。signal 用于取消进行中的下载。 */
export async function downloadFile(url: string, dest: string, headers: Record<string, string> = {}, signal?: AbortSignal): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true })

  const done = existsSync(dest) ? statSync(dest).size : 0
  const res = await fetch(url, {
    headers: done > 0 ? { ...headers, range: `bytes=${done}-` } : headers,
    ...(signal ? { signal } : {}),
  })
  if (!res.ok && res.status !== 206) { throw new Error(`download failed: ${res.status} ${url}`) }
  const body = res.body
  if (!body) { throw new Error(`empty body: ${url}`) }

  // 只有 206 且 Content-Range 起点恰好等于本地已有字节数才续传追加；
  // 否则（200 全量、或服务端忽略了 Range 返回了别的位置）一律整文件重写，避免拼出损坏包
  const rangeStart = res.status === 206
    ? Number.parseInt(res.headers.get('content-range')?.match(/bytes\s+(\d+)-/i)?.[1] ?? '', 10)
    : Number.NaN
  const append = done > 0 && Number.isFinite(rangeStart) && rangeStart === done

  // fetch 的 body 是 DOM ReadableStream，与 node:stream/web 的 ReadableStream 类型不兼容；
  // 逐块读取后交给 Readable.from，交给 pipeline 统一处理背压、错误与关闭
  const reader = body.getReader()
  const chunks = (async function* () {
    try {
      for (;;) {
        const { done: ended, value } = await reader.read()
        if (ended) { return }
        yield value
      }
    }
    finally {
      reader.releaseLock()
    }
  })()
  const output = createWriteStream(dest, { flags: append ? 'a' : 'w' })
  const source = Readable.from(chunks, { objectMode: false })
  if (signal) { await pipeline(source, output, { signal }) }
  else { await pipeline(source, output) }
}

/** 校验失败即抛（调用方负责清理 staging） */
export async function verifySha256(path: string, expected: string): Promise<void> {
  const actual = await sha256File(path)
  if (actual !== expected) { throw new Error(`sha256 mismatch: expect ${expected}, got ${actual}`) }
}
