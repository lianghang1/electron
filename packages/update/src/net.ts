import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

/**
 * 更新公共设施：断点续传下载 + sha256 校验。
 * 铁验收：任何中断（断电/断网/进程被杀）后，下次启动必须落在可运行版本——
 * 一切写入先进 staging 目录，校验通过才原子 rename 进正式位。
 */

export function sha256File(path: string): string {
  return createHash('sha256').update(createReadStream(path)).digest('hex')
}

/** 断点续传下载：服务端须支持 Range；不支持则整文件重下 */
export async function downloadFile(url: string, dest: string, headers: Record<string, string> = {}): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true })

  const done = existsSync(dest) ? statSync(dest).size : 0
  const res = await fetch(url, {
    headers: done > 0 ? { ...headers, range: `bytes=${done}-` } : headers,
  })
  if (!res.ok && res.status !== 206)
    throw new Error(`download failed: ${res.status} ${url}`)
  if (!res.body)
    throw new Error(`empty body: ${url}`)

  // 服务端不支持 Range（200 而非 206）时整文件重写
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest, { flags: res.status === 206 ? 'a' : 'w' }))
}

/** 校验失败即抛（调用方负责清理 staging） */
export function verifySha256(path: string, expected: string): void {
  const actual = sha256File(path)
  if (actual !== expected)
    throw new Error(`sha256 mismatch: expect ${expected}, got ${actual}`)
}
