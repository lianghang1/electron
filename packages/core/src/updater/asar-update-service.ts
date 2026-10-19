import type { AsarUpdateState, UpdateAsarSource, UpdateManifest } from '@desktop/shared'
import type { EventBus } from '../event/event-bus'
import type { Logger } from '../logger/logger'
import type { ApplyBundleResult, CurrentMark } from './bundle'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { is } from '@electron-toolkit/utils'
import { app, net } from 'electron'
import { applyBundle, clearOrphanAsars, getAsarUpdateDir, getPendingMarkPath, rmAsar } from './bundle'
import { downloadBundle, isAbortError } from './download'
import { compareVersions } from './version'

/**
 * asar 热更新（引导器模式）：
 * - 清单 { version, url } → 下载热更 zip 包 → 包内 update.json 自描述校验
 *   （版本一致性 / 资源配对门槛 / sha256 强校验）→ 解出 asar 落盘 userData
 * - 校验通过写 pending 标记；【运行中绝不替换】——重启应用后由引导器
 *   （resources/app.asar，永不更新）在启动早期完成 current.json 指针切换
 *   （版本化文件名下载即终名，零 rename 零文件锁、零安装目录权限要求）
 * - 防变砖双保险：引导器加载热更 asar 失败自动回退内置 app.core.asar；
 *   替换后首启未存活 60s 自动回滚内置包（逻辑在 packages/core/launcher/out/main/index.cjs）
 */
export class AsarUpdateService {
  private pendingVersion: string | null = null
  private checking = false
  /** 进行中下载的取消控制器（cancel 触发 AbortError，归入容错路径） */
  private abortController: AbortController | null = null
  /** 最近一次推送的热更状态（先拉后推的快照源） */
  private lastState: AsarUpdateState = { status: 'idle' }
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

  /** 检查清单 → 必要时下载热更包 → 包内自描述校验 → 写 pending 标记 */
  async check(): Promise<void> {
    if (!this.source || this.checking) { return }
    this.checking = true
    const push = (state: AsarUpdateState) => {
      this.lastState = state
      this.events.emit('update:asarState', state)
    }
    try {
      push({ status: 'checking' })
      const manifest = await this.fetchManifest()
      if (!manifest?.version || !manifest.url) {
        this.logger.warn('invalid asar update manifest, ignored')
        push({ status: 'idle' })
        return
      }

      const current = await this.readCurrentMark()
      const builtin = app.getVersion()
      // 重装新版后残留旧热更（热更版本 < 内置版本）：清理，保证版本单调
      if (current && compareVersions(current.version, builtin) < 0) {
        this.logger.info(`stale hot asar ${current.version} < builtin ${builtin}, cleaning up`)
        await rmAsar(getAsarUpdateDir(), { recursive: true })
      }

      // 生效版本 = max(内置版本, 当前热更版本)；清单不比它新则无需更新
      const effective = current && compareVersions(current.version, builtin) > 0 ? current.version : builtin
      if (compareVersions(manifest.version, effective) <= 0) {
        this.logger.info(`asar up to date: ${manifest.version}`)
        push({ status: 'idle', version: manifest.version })
        return
      }

      const outcome = await this.downloadAndVerify(manifest, push)
      if (outcome.status === 'blocked') {
        // 资源配对不满足：本机 resources 旧于热更要求，等待整包更新先行
        push({ status: 'blocked', version: manifest.version, minResourcesVersion: outcome.minResourcesVersion })
        return
      }
      // 版本化文件名（下载即终名，永不 rename——规避运行中文件的锁冲突）；
      // 下载即清孤儿（非生效、非本次待生效），引导器只负责切换 current.json 指针
      const keepFiles = [outcome.pending.file, current?.file].filter((file): file is string => Boolean(file))
      await clearOrphanAsars(getAsarUpdateDir(), keepFiles)
      await writeFile(getPendingMarkPath(), JSON.stringify(outcome.pending))
      this.pendingVersion = outcome.pending.version
      this.logger.info(`asar update ready: ${outcome.pending.version}, will apply after relaunch`)
      push({ status: 'pending', version: outcome.pending.version })
    }
    catch (error) {
      // 主动取消归入容错路径：非错误，状态归位等待下次检查
      if (isAbortError(error)) {
        this.logger.info('asar update download cancelled')
        push({ status: 'idle' })
        return
      }
      this.logger.error('asar update failed', { error: String(error) })
      push({ status: 'error', message: String(error) })
    }
    finally {
      this.checking = false
    }
  }

  /** 取消进行中的热更下载（无进行中下载为空操作；AbortError 归入容错路径推 idle） */
  cancel(): void {
    this.abortController?.abort()
  }

  /** 是否有待生效的热更（install 统一入口判定用） */
  hasPending(): boolean {
    return this.pendingVersion !== null || existsSync(getPendingMarkPath())
  }

  /** 当前热更状态快照（最近一次推送值；未跑过检查 = idle） */
  getState(): AsarUpdateState {
    return this.lastState
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

  /** 当前生效的热更版本（无热更或读取失败 = null）；重启路径更新择优用 */
  async getEffectiveHotVersion(): Promise<string | null> {
    return (await this.readCurrentMark())?.version ?? null
  }

  private resolveManifestUrl(ref: string): string {
    if (/^[a-z]+:\/\//i.test(ref)) { return ref }
    if (!this.feedUrl) { throw new Error('updates.url is required to resolve relative asar manifest path') }
    return new URL(ref, this.feedUrl.endsWith('/') ? this.feedUrl : `${this.feedUrl}/`).toString()
  }

  /**
   * 清单获取：字符串源 = 原生清单文件；适配器源 = 拉取判断接口响应并经 transform 适配
   * （method/headers/body 由适配器定制透传）。后端接口格式变化只改 transform
   * （electron/main 内，随热更下发），本服务链路零改动。
   */
  private async fetchManifest(): Promise<UpdateManifest> {
    const source = this.source
    if (source === undefined) { throw new Error('asar update source is not configured') }
    if (typeof source === 'string') {
      this.manifestUrl = this.resolveManifestUrl(source)
      return this.fetchJson<UpdateManifest>(this.manifestUrl)
    }
    const adapter = source
    this.manifestUrl = this.resolveManifestUrl(adapter.endpoint)
    const raw = await this.fetchJson<unknown>(this.manifestUrl, {
      method: adapter.method,
      headers: adapter.headers,
      body: adapter.body,
    })
    if (!adapter.transform) { return raw as UpdateManifest }
    return adapter.transform(raw)
  }

  private async fetchJson<T>(
    url: string,
    init: { method?: 'GET' | 'POST', headers?: Record<string, string>, body?: string } = {},
  ): Promise<T> {
    const response = await net.fetch(url, { method: init.method ?? 'GET', headers: init.headers, body: init.body })
    if (!response.ok) { throw new Error(`manifest fetch failed: ${response.status} ${url}`) }
    return await response.json() as T
  }

  /** 下载热更包 zip（流式进度，可取消），包内自描述校验与解包见 bundle.applyBundle */
  private async downloadAndVerify(
    manifest: UpdateManifest,
    push: (state: AsarUpdateState) => void,
  ): Promise<ApplyBundleResult> {
    const url = new URL(manifest.url, this.manifestUrl ?? undefined).toString()
    // 下载落盘跟随清单 url 的真实扩展名（协议固定 zip 包）：.asar 后缀文件会被 Electron 的
    // asar 补丁劫持 fs 语义，中间容器绝不能带 .asar 名
    const target = path.join(getAsarUpdateDir(), path.basename(manifest.url))
    const controller = new AbortController()
    this.abortController = controller
    try {
      await downloadBundle({
        url,
        target,
        signal: controller.signal,
        onProgress: percent => push({ status: 'downloading', version: manifest.version, percent }),
      })
      this.logger.info(`asar bundle downloaded: ${manifest.version}`)
      return await applyBundle(target, manifest.version)
    }
    finally {
      this.abortController = null
    }
  }

  private async readCurrentMark(): Promise<CurrentMark | null> {
    try {
      const raw = await readFile(path.join(getAsarUpdateDir(), 'current.json'), 'utf8')
      return JSON.parse(raw) as CurrentMark
    }
    catch {
      return null
    }
  }
}
