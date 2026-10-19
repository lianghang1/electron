import type { UpdateState } from '@desktop/shared'
import type { EventBus } from '../event/event-bus'
import type { Logger } from '../logger/logger'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import electronUpdater from 'electron-updater'
import { compareVersions } from './version'

/**
 * 自动更新（electron-updater，generic provider）：
 * - DesktopConfig.updates 未配置 → 更新检查整体关闭
 * - dev 模式跳过（无打包产物，checkForUpdates 会报错）
 * - 检查到新版本自动下载，完成后推送到 Shell，由用户点击「重启更新」安装
 * - 授权头（T-Auth）：配置 DESKTOP_UPDATE_TOKEN 后清单与安装器下载均携带 X-Api-Key（默认关闭）
 */
export class UpdateService {
  private readonly autoUpdater = electronUpdater.autoUpdater
  private installed = false
  private downloaded = false
  private downloadedVersion: string | null = null
  /** 最近一次状态（getState 快照用，先拉后推约定） */
  private lastState: UpdateState = { status: 'idle' }

  constructor(
    private readonly feedUrl: string | undefined,
    private readonly events: EventBus,
    private readonly logger: Logger,
  ) {}

  /** 当前整包更新状态快照 */
  getState(): UpdateState {
    return this.lastState
  }

  /** 启动自动更新（配置了 updates.url 且非 dev 时生效） */
  start(): void {
    if (is.dev) {
      this.logger.debug('update check skipped in dev mode')
      return
    }
    if (!this.feedUrl) {
      this.logger.info('updates not configured, update check disabled')
      return
    }

    this.autoUpdater.setFeedURL({ provider: 'generic', url: this.feedUrl })
    this.applyAuthHeader()
    this.autoUpdater.autoInstallOnAppQuit = true

    const push = (state: UpdateState) => {
      this.lastState = state
      this.events.emit('update:state', state)
    }
    // 下载 promise 显式接管：autoDownload 的内置 promise 是 fire-and-forget，
    // 缺 app-update.yml（win-unpacked 直跑）等场景会 unhandled rejection
    this.autoUpdater.autoDownload = false
    this.autoUpdater.on('checking-for-update', () => push({ status: 'checking' }))
    this.autoUpdater.on('update-available', (info) => {
      this.logger.info(`update available: ${info.version}`)
      push({ status: 'available', version: info.version })
      void this.autoUpdater.downloadUpdate().catch((error) => {
        this.logger.error('update download failed', { error: String(error) })
        push({ status: 'error', message: toUserMessage(error) })
      })
    })
    this.autoUpdater.on('update-not-available', info =>
      push({ status: 'not-available', version: info.version }))
    this.autoUpdater.on('download-progress', progress =>
      push({ status: 'downloading', percent: progress.percent }))
    this.autoUpdater.on('update-downloaded', (info) => {
      this.logger.info(`update downloaded: ${info.version}`)
      this.downloaded = true
      this.downloadedVersion = info.version
      push({ status: 'downloaded', version: info.version })
    })
    this.autoUpdater.on('error', (error) => {
      this.logger.error('update error', { error: String(error) })
      push({ status: 'error', message: toUserMessage(error) })
    })

    this.installed = true
    void this.autoUpdater.checkForUpdates().catch((error) => {
      this.logger.error('initial update check failed', { error: String(error) })
    })
  }

  /** 手动触发检查（Shell 调用） */
  check(): void {
    if (!this.installed) { return }
    // 检查/下载进行中再触发检查会与 electron-updater 内部状态冲突：重推当前状态防 UI 卡 checking
    if (this.isBusy()) {
      this.events.emit('update:state', this.lastState)
      return
    }
    void this.autoUpdater.checkForUpdates().catch((error) => {
      this.logger.error('update check failed', { error: String(error) })
    })
  }

  /** 整包是否已下载完成（定时重启决策用；仅内存态，重启后自愈一个检查周期） */
  isDownloaded(): boolean {
    return this.downloaded
  }

  /** 已下载完成的整包版本（重启路径更新择优用） */
  getDownloadedVersion(): string | null {
    return this.downloadedVersion
  }

  /** 下载完成后静默安装并自拉起（kiosk 无人值守：避免安装向导弹窗与关机态） */
  install(): void {
    if (this.installed) { this.autoUpdater.quitAndInstall(true, true) }
  }

  /**
   * 重启路径更新择优（退出竞态防御）：
   * - 整包已下载且新于生效版本 → quitAndInstall 接管退出（返回 true）
   * - 否则关闭退出时自动安装（relaunch 武装新实例后，旧进程退出若触发 electron-updater
   *   的 quit 安装钩子会与安装器替换安装目录竞态），返回 false 由调用方继续 relaunch。
   * 版本比较仅用于重启路径择优，不做下载拦截。
   */
  resolveRelaunch(effectiveVersion: string): boolean {
    if (this.downloaded && this.downloadedVersion
      && compareVersions(this.downloadedVersion, effectiveVersion) > 0) {
      this.install()
      return true
    }
    this.autoUpdater.autoInstallOnAppQuit = false
    return false
  }

  /** 检查/下载进行中（重触发检查会与 electron-updater 内部状态冲突的区间） */
  private isBusy(): boolean {
    return ['checking', 'available', 'downloading', 'downloaded'].includes(this.lastState.status)
  }

  /**
   * 整包通道授权头（默认关闭）：electron-updater 仅支持静态请求头，6.8.9 已核
   * requestHeaders 对清单与安装器下载同时生效；token 经 DESKTOP_UPDATE_TOKEN 注入
   */
  private applyAuthHeader(): void {
    const token = process.env.DESKTOP_UPDATE_TOKEN
    if (!token) { return }
    this.autoUpdater.requestHeaders = { 'X-Api-Key': token }
    this.logger.info('update auth header enabled')
  }
}

/** 错误文案映射：内部细节（网络栈错误码 / URL）不直出用户，完整信息留在日志 */
function toUserMessage(error: Error): string {
  const raw = error.message
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|net::|timeout|aborted/i.test(raw)) { return '无法连接更新服务器' }
  if (/40[13]/.test(raw)) { return '更新服务暂不可用' }
  return '更新失败，请稍后重试'
}
