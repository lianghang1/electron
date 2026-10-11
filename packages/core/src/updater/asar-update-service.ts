import type { AsarUpdateState, UpdateManifest } from '@desktop/shared'
import type { Buffer } from 'node:buffer'
import type { EventBus } from '../event/event-bus'
import type { Logger } from '../logger/logger'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { is } from '@electron-toolkit/utils'
import { app, net } from 'electron'
import originalFs from 'original-fs'
import { compareVersions } from './version'

/** asar 热更工作目录（userData 下，用户可写，与安装位置权限无关） */
export function getAsarUpdateDir(): string {
  return path.join(app.getPath('userData'), 'desktop-updater')
}

/** pending 标记（存在 = 已下载校验通过，等待引导器替换） */
export function getPendingMarkPath(): string {
  return path.join(getAsarUpdateDir(), 'pending.json')
}

interface PendingMark {
  version: string
  file: string
  sha256: string
}

interface CurrentMark {
  version: string
  file: string
  appliedAt: number
}

/** 热更包文件名：版本化命名，下载即终名，引导器永不 rename */
function asarFileName(version: string): string {
  return `core-${version.replace(/[^\w.-]/g, '_')}.asar`
}

/** 本机 resources 版本标记（afterPack 写入；dev 环境 / 无标记的旧安装返回 null = 不设限） */
function readResourcesVersion(): string | null {
  try {
    const marker = path.join(process.resourcesPath, 'resources', '.resources-version')
    return existsSync(marker) ? readFileSync(marker, 'utf8').trim() : null
  }
  catch {
    return null
  }
}

/** 下载进度推送节流 */
const PROGRESS_THROTTLE_MS = 500

/**
 * asar 热更新（引导器模式）：
 * - 清单 { version, url, sha256 } → 下载新 asar 到 userData → sha256 强校验
 * - 校验通过写 pending 标记；【运行中绝不替换】——重启应用后由引导器
 *   （resources/app.asar，永不更新）在启动早期完成 current.json 指针切换
 *   （版本化文件名下载即终名，零 rename 零文件锁、零安装目录权限要求）
 * - 防变砖双保险：引导器加载热更 asar 失败自动回退内置 app.core.asar；
 *   替换后首启未存活 60s 自动回滚内置包（逻辑在 build/launcher/out/main/index.js）
 */
export class AsarUpdateService {
  private pendingVersion: string | null = null
  private checking = false

  constructor(
    private readonly manifestRef: string | undefined,
    private readonly feedUrl: string | undefined,
    private readonly events: EventBus,
    private readonly logger: Logger,
  ) {}

  /** 启动检查（dev 跳过；未配置清单跳过） */
  async start(): Promise<void> {
    if (is.dev) {
      this.logger.debug('asar update check skipped in dev mode')
      return
    }
    if (!this.manifestRef) {
      this.logger.info('asar updates not configured, asar update disabled')
      return
    }
    await this.check()
  }

  /** 检查清单 → 必要时下载校验 → 写 pending 标记 */
  async check(): Promise<void> {
    if (!this.manifestRef || this.checking)
      return
    this.checking = true
    const push = (state: AsarUpdateState) => this.events.emit('update:asarState', state)
    try {
      push({ status: 'checking' })
      const manifest = await this.fetchJson<UpdateManifest>(this.resolveManifestUrl())
      if (!manifest?.version || !manifest.url || !manifest.sha256) {
        this.logger.warn('invalid asar update manifest, ignored')
        push({ status: 'idle' })
        return
      }

      const builtin = app.getVersion()
      const current = await this.readCurrentVersion()
      // 重装新版后残留旧热更（热更版本 < 内置版本）：清理，保证版本单调
      if (current && compareVersions(current, builtin) < 0) {
        this.logger.info(`stale hot asar ${current} < builtin ${builtin}, cleaning up`)
        await rmAsar(getAsarUpdateDir(), { recursive: true })
      }

      // 生效版本 = max(内置版本, 当前热更版本)；清单不比它新则无需更新
      const effective = current && compareVersions(current, builtin) > 0 ? current : builtin
      if (compareVersions(manifest.version, effective) <= 0) {
        this.logger.info(`asar up to date: ${manifest.version}`)
        push({ status: 'idle', version: manifest.version })
        return
      }

      // 资源配对：热更只换代码，热更代码依赖新版 resources（厂商 DLL/内置页面）而本机
      // resources 旧于要求时拒绝应用，等待整包更新先行（清单不带该字段 = 不设限）
      if (manifest.minResourcesVersion) {
        const localResources = readResourcesVersion()
        if (localResources && compareVersions(manifest.minResourcesVersion, localResources) > 0) {
          this.logger.warn(
            `asar update ${manifest.version} requires resources >= ${manifest.minResourcesVersion}, local ${localResources}; skipped until full update`,
          )
          push({ status: 'idle' })
          return
        }
      }

      await this.downloadAndVerify(manifest, push)
      await mkdir(getAsarUpdateDir(), { recursive: true })
      // 版本化文件名（下载即终名，永不 rename——规避运行中文件的锁冲突）；
      // 引导器只负责切换 current.json 指针
      await writeFile(getPendingMarkPath(), JSON.stringify({
        version: manifest.version,
        file: asarFileName(manifest.version),
        sha256: manifest.sha256,
      } satisfies PendingMark))
      this.pendingVersion = manifest.version
      this.logger.info(`asar update ready: ${manifest.version}, will apply after relaunch`)
      push({ status: 'pending', version: manifest.version })
    }
    catch (error) {
      this.logger.error('asar update failed', { error: String(error) })
      push({ status: 'error', message: String(error) })
    }
    finally {
      this.checking = false
    }
  }

  /** 是否有待生效的热更（install 统一入口判定用） */
  hasPending(): boolean {
    return this.pendingVersion !== null || existsSync(getPendingMarkPath())
  }

  /** 重启应用：引导器在下次启动早期完成替换 */
  install(): void {
    if (!this.hasPending()) {
      this.logger.warn('asar install skipped: no pending update')
      return
    }
    this.logger.info(`relaunching to apply asar update: ${this.pendingVersion ?? 'pending'}`)
    app.relaunch()
    app.exit(0)
  }

  private resolveManifestUrl(): string {
    const ref = this.manifestRef ?? ''
    if (/^[a-z]+:\/\//i.test(ref))
      return ref
    if (!this.feedUrl)
      throw new Error('updates.url is required to resolve relative asar manifest path')
    return new URL(ref, this.feedUrl.endsWith('/') ? this.feedUrl : `${this.feedUrl}/`).toString()
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await net.fetch(url, { method: 'GET' })
    if (!response.ok)
      throw new Error(`manifest fetch failed: ${response.status} ${url}`)
    return await response.json() as T
  }

  /** 下载 + 流式进度 + sha256 强校验（不过校验不落 pending） */
  private async downloadAndVerify(
    manifest: UpdateManifest,
    push: (state: AsarUpdateState) => void,
  ): Promise<void> {
    const url = new URL(manifest.url, this.resolveManifestUrl()).toString()
    const response = await net.fetch(url)
    if (!response.ok || !response.body)
      throw new Error(`asar download failed: ${response.status} ${url}`)

    const total = Number(response.headers.get('content-length') ?? 0)
    const target = path.join(getAsarUpdateDir(), asarFileName(manifest.version))
    await mkdir(getAsarUpdateDir(), { recursive: true })

    let received = 0
    let lastPush = 0
    const source = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
    source.on('data', (chunk: Buffer) => {
      received += chunk.length
      const now = Date.now()
      if (now - lastPush < PROGRESS_THROTTLE_MS)
        return
      lastPush = now
      push({
        status: 'downloading',
        version: manifest.version,
        percent: total > 0 ? Math.floor((received / total) * 100) : -1,
      })
    })
    await pipeline(source, originalFs.createWriteStream(target))

    const actual = await sha256File(target)
    if (actual !== manifest.sha256.toLowerCase()) {
      await rmAsar(target)
      throw new Error(`asar checksum mismatch: expected ${manifest.sha256}, got ${actual}`)
    }
    this.logger.info(`asar downloaded: ${manifest.version} (${received} bytes), checksum ok`)
  }

  private async readCurrentVersion(): Promise<string | null> {
    try {
      const raw = await readFile(path.join(getAsarUpdateDir(), 'current.json'), 'utf8')
      return (JSON.parse(raw) as Partial<CurrentMark>).version ?? null
    }
    catch {
      return null
    }
  }
}

/** Electron 把 *.asar 路径代理为 asar 虚拟文件系统（fs.rm 按目录处理报 EISDIR），删除真实 asar 必须绕过补丁 */
function rmAsar(target: string, options: { recursive?: boolean } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    originalFs.rm(target, { force: true, ...options }, (error: Error | null) => (error ? reject(error) : resolve()))
  })
}

async function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // 读真实 asar 文件内容算哈希：打补丁的 fs 会把它当虚拟目录，必须用 original-fs
    const hash = createHash('sha256')
    const stream = originalFs.createReadStream(file)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}
