import type { UpdateState } from '@desktop/shared'
import type { EventBus } from '../event/event-bus'
import type { Logger } from '../logger/logger'
import { is } from '@electron-toolkit/utils'
import electronUpdater from 'electron-updater'

/**
 * 自动更新（electron-updater，generic provider）：
 * - DesktopConfig.updates 未配置 → 更新检查整体关闭
 * - dev 模式跳过（无打包产物，checkForUpdates 会报错）
 * - 检查到新版本自动下载，完成后推送到 Shell，由用户点击「重启更新」安装
 */
export class UpdateService {
  private readonly autoUpdater = electronUpdater.autoUpdater
  private installed = false

  constructor(
    private readonly feedUrl: string | undefined,
    private readonly events: EventBus,
    private readonly logger: Logger,
  ) {}

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
    this.autoUpdater.autoDownload = true
    this.autoUpdater.autoInstallOnAppQuit = true

    const push = (state: UpdateState) => this.events.emit('update:state', state)
    this.autoUpdater.on('checking-for-update', () => push({ status: 'checking' }))
    this.autoUpdater.on('update-available', (info) => {
      this.logger.info(`update available: ${info.version}`)
      push({ status: 'available', version: info.version })
    })
    this.autoUpdater.on('update-not-available', info =>
      push({ status: 'not-available', version: info.version }))
    this.autoUpdater.on('download-progress', progress =>
      push({ status: 'downloading', percent: progress.percent }))
    this.autoUpdater.on('update-downloaded', (info) => {
      this.logger.info(`update downloaded: ${info.version}`)
      push({ status: 'downloaded', version: info.version })
    })
    this.autoUpdater.on('error', (error) => {
      this.logger.error('update error', { error: String(error) })
      push({ status: 'error', message: error.message })
    })

    this.installed = true
    void this.autoUpdater.checkForUpdates().catch((error) => {
      this.logger.error('initial update check failed', { error: String(error) })
    })
  }

  /** 手动触发检查（Shell 调用） */
  check(): void {
    if (!this.installed)
      return
    void this.autoUpdater.checkForUpdates().catch((error) => {
      this.logger.error('update check failed', { error: String(error) })
    })
  }

  /** 下载完成后重启安装 */
  install(): void {
    if (this.installed)
      this.autoUpdater.quitAndInstall()
  }
}
