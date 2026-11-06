import type { FlavorManifest } from '@shell/shared'
import type { Startable } from '@shell/kernel'
import { BrowserWindow, app } from 'electron'
import { join } from 'node:path'
import { overlayBase, shellBase } from './presets'
import { createDesktopMode, createKioskMode } from './modes'

/**
 * WindowSystem：全仓库唯一 new BrowserWindow 的地方（铁律一）。
 * 对外只暴露目的命名 API——读调用处即读产品动作（铁律二）。
 */
export class WindowSystem implements Startable {
  readonly name = 'window'
  private windows = new Map<number, BrowserWindow>()

  constructor(
    private readonly flavor: FlavorManifest,
    private readonly rendererDir: string,
  ) {}

  async start(): Promise<void> {}
  async stop(): Promise<void> {
    for (const win of this.windows.values())
      win.destroy()
    this.windows.clear()
  }

  /** 工作台主窗：tab 条 + 左导航的产品主体 */
  createShellWindow(): BrowserWindow {
    const mode = this.flavor.mode === 'kiosk' ? createKioskMode() : createDesktopMode()
    const win = new BrowserWindow({
      ...shellBase,
      width: 1280,
      height: 800,
    })
    mode.enter(win)

    // 生产：加载本地产物；dev：electron-vite 注入 ELECTRON_RENDERER_URL
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl)
      void win.loadURL(devUrl)
    else
      void win.loadFile(join(this.rendererDir, 'index.html'))

    win.once('ready-to-show', () => win.show())
    this.track(win)
    return win
  }

  /** 拍摄浮窗 */
  openCaptureOverlay(): BrowserWindow {
    return this.createOverlay('capture')
  }

  /** 授权弹窗 */
  openPermissionDialog(): BrowserWindow {
    return this.createOverlay('permission')
  }

  /** 应用中心浮窗 */
  openAppCenterOverlay(): BrowserWindow {
    return this.createOverlay('app-center')
  }

  /** 设置浮窗 */
  openSettingsOverlay(): BrowserWindow {
    return this.createOverlay('settings')
  }

  get(id: number): BrowserWindow | undefined {
    return this.windows.get(id)
  }

  private createOverlay(kind: string): BrowserWindow {
    const win = new BrowserWindow({ ...overlayBase, width: 480, height: 360 })
    const devUrl = process.env.ELECTRON_RENDERER_URL
    const hash = `#/overlay?kind=${kind}`
    if (devUrl)
      void win.loadURL(`${devUrl}/${hash}`)
    else
      void win.loadFile(join(this.rendererDir, 'index.html'), { hash })
    win.once('ready-to-show', () => win.show())
    this.track(win)
    return win
  }

  private track(win: BrowserWindow): void {
    this.windows.set(win.id, win)
    win.on('closed', () => this.windows.delete(win.id))
    // 全部窗口关闭即退出（托盘常驻由 TraySystem M6 接管后调整）
    if (this.windows.size === 1)
      app.on('window-all-closed', () => app.quit())
  }
}
