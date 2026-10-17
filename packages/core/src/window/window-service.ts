import type { EventBus } from '../event/event-bus'
import type { CallerResolver } from '../ipc/caller-context'
import type { Logger } from '../logger/logger'
import type { BootstrapOptions } from '../types'
import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow } from 'electron'
import { SHELL_APP_ID } from '../constants'
import { applyWebContentsGuards } from './security'

/**
 * 主窗口管理：创建 / 引用 / 状态事件。窗口尺寸标题来自 DesktopConfig，
 * Electron 差异项走逃生口。dev 加载 renderer URL，生产加载打包产物。
 */
export class WindowService {
  private mainWindow: BrowserWindow | null = null

  constructor(
    private readonly events: EventBus,
    private readonly resolver: CallerResolver,
    private readonly logger: Logger,
  ) {}

  createMainWindow(options: BootstrapOptions): BrowserWindow {
    const win = new BrowserWindow({
      width: options.window.width,
      height: options.window.height,
      minWidth: options.window.minWidth,
      minHeight: options.window.minHeight,
      title: options.window.title ?? options.app.name,
      show: false,
      autoHideMenuBar: true,
      ...(process.platform === 'linux' && options.icon ? { icon: options.icon } : {}),
      ...options.browserWindowOptions,
      webPreferences: {
        // CJS preload（.cjs，由 @desktop/config 强制输出）：沙箱环境的 preload 不支持 ESM，
        // 二者必须配套。若改为 ESM preload 需同步设置 sandbox: false（见 Electron ESM 文档）
        preload: join(__dirname, '../preload/index.cjs'),
        // Electron 安全清单（安全默认显式声明，防止上游默认值变化或误配）。
        // 这是 core 级安全基线，不可通过配置关闭
        sandbox: true,
        contextIsolation: true,
        webSecurity: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        nodeIntegrationInSubFrames: false,
        webviewTag: false,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
        ...options.webPreferences,
      },
    })

    win.on('ready-to-show', () => win.show())

    const devUrl = process.env.ELECTRON_RENDERER_URL
    const appOrigin = is.dev && devUrl ? new URL(devUrl).origin : null
    applyWebContentsGuards(win, appOrigin, options.permissions)

    // Shell 是平台自身：登记调用者身份，IPC 侧按 SHELL_APP_ID 全量放行
    this.resolver.register(win.webContents, { appId: SHELL_APP_ID, instanceId: 'shell' })
    win.on('closed', () => {
      this.mainWindow = null
    })

    // 最大化状态变化（含系统标题栏双击）→ 事件总线，由 Application 推给 Shell UI
    win.on('maximize', () => this.events.emit('window:maximizedChanged', true))
    win.on('unmaximize', () => this.events.emit('window:maximizedChanged', false))
    // 最小化/隐藏期间 WebContentsView bounds 不可靠，重新可见后由订阅方重新施加
    win.on('show', () => this.events.emit('window:shown'))
    win.on('restore', () => this.events.emit('window:shown'))

    const load
      = is.dev && process.env.ELECTRON_RENDERER_URL
        ? win.loadURL(process.env.ELECTRON_RENDERER_URL)
        : win.loadFile(join(__dirname, '../renderer/index.html'))
    void load.catch((error) => {
      this.logger.error('failed to load renderer', { error: String(error) })
    })

    this.mainWindow = win
    return win
  }

  getMainWindow(): BrowserWindow | undefined {
    return this.mainWindow ?? undefined
  }
}
