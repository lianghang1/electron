import type { AsarUpdateState, UpdateAsarSource, UpdateManifest } from '@desktop/shared'
import type { EventBus } from '../event/event-bus'
import type { Logger } from '../logger/logger'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import originalFs from 'original-fs'
import { is } from '@electron-toolkit/utils'
import AdmZip from 'adm-zip'
import { app, net } from 'electron'
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

/** 下载落盘名：跟随清单 url 的真实扩展名（zip 容器存 .zip，解包后才产生 .asar） */
function payloadFileName(manifest: UpdateManifest): string {
  return path.basename(manifest.url)
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
  /** 清单实际地址（native=清单文件 / adapter=判断接口），下载相对 URL 的解析基准 */
  private manifestUrl: string | null = null

  constructor(
    private readonly source: string | UpdateAsarSource | undefined,
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
    if (!this.source) {
      this.logger.info('asar updates not configured, asar update disabled')
      return
    }
    await this.check()
  }

  /** 检查清单 → 必要时下载校验 → 写 pending 标记 */
  async check(): Promise<void> {
    if (!this.source || this.checking)
      return
    this.checking = true
    const push = (state: AsarUpdateState) => this.events.emit('update:asarState', state)
    try {
      push({ status: 'checking' })
      const manifest = await this.fetchManifest()
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

  private resolveManifestUrl(ref: string): string {
    if (/^[a-z]+:\/\//i.test(ref))
      return ref
    if (!this.feedUrl)
      throw new Error('updates.url is required to resolve relative asar manifest path')
    return new URL(ref, this.feedUrl.endsWith('/') ? this.feedUrl : `${this.feedUrl}/`).toString()
  }

  /**
   * 清单获取：字符串源 = 原生清单文件；适配器源 = 拉取判断接口响应并经 transform 适配。
   * 后端接口格式变化只改 transform（electron/main 内，随热更下发），本服务链路零改动。
   */
  private async fetchManifest(): Promise<UpdateManifest> {
    const source = this.source
    if (source === undefined)
      throw new Error('asar update source is not configured')
    if (typeof source === 'string') {
      this.manifestUrl = this.resolveManifestUrl(source)
      return this.fetchJson<UpdateManifest>(this.manifestUrl)
    }
    const adapter = source
    this.manifestUrl = this.resolveManifestUrl(adapter.endpoint)
    const raw = await this.fetchJson<unknown>(this.manifestUrl)
    if (!adapter.transform)
      return raw as UpdateManifest
    return adapter.transform(raw)
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
    const url = new URL(manifest.url, this.manifestUrl ?? undefined).toString()
    const response = await net.fetch(url)
    if (!response.ok || !response.body)
      throw new Error(`asar download failed: ${response.status} ${url}`)

    const total = Number(response.headers.get('content-length') ?? 0)
    // 下载落盘跟随载荷真实扩展名（zip 容器存 .zip）：.asar 后缀文件会被 Electron 的
    // asar 补丁劫持 fs 语义，中间容器绝不能带 .asar 名
    const target = path.join(getAsarUpdateDir(), payloadFileName(manifest))
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

    // zip 容器适配：后端体系可能以 zip 封装热更包（传输信封）——校验后解出真正的
    // asar（引导器消费的名字）并删除容器。读写走 originalFs 绕过 asar 补丁：
    // .asar 后缀文件的 fs 操作会被补丁劫持为归档解析（zip 内容解析失败 → 读到垃圾）。
    // zip-slip 防护：只取 .asar 条目内容写入固定路径，不做路径解压。
    if (isZipFile(target)) {
      const asarBytes = extractAsarFromZip(originalFs.readFileSync(target))
      const asarPath = path.join(getAsarUpdateDir(), asarFileName(manifest.version))
      originalFs.writeFileSync(asarPath, asarBytes)
      originalFs.rmSync(target)
      this.logger.info(`zip container unpacked: ${manifest.version}`)
    }
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

/** zip 魔数（PK）检测：载荷可能是 zip 封装的 asar，也可能是裸 asar */
function isZipFile(file: string): boolean {
  const head = Buffer.alloc(4)
  const fd = originalFs.openSync(file, 'r')
  try {
    originalFs.readSync(fd, head, 0, 4, 0)
  }
  finally {
    originalFs.closeSync(fd)
  }
  return head[0] === 0x50 && head[1] === 0x4B && (head[2] === 0x03 || head[2] === 0x05 || head[2] === 0x07)
}

/** 从 zip 容器提取 asar：优先 app.core.asar 条目，否则唯一的 .asar 条目；没有则报错 */
function extractAsarFromZip(zipBytes: Buffer): Buffer {
  const zip = new AdmZip(zipBytes)
  const entries = zip.getEntries().filter(entry => !entry.isDirectory)
  const asarEntries = entries.filter(entry => entry.entryName.endsWith('.asar'))
  const entry = asarEntries.find(e => e.entryName === 'app.core.asar') ?? (asarEntries.length === 1 ? asarEntries[0] : undefined)
  if (!entry)
    throw new Error(`zip 容器中未找到唯一的 .asar 热更包（条目: ${entries.map(e => e.entryName).slice(0, 10).join(', ')}）`)
  return entry.getData()
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
