import type { FlavorManifest } from '@shell/shared'
import type { EventBus } from '@shell/kernel'
import type { Startable } from '@shell/kernel'
import { BrowserWindow, app, ipcMain } from 'electron'
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

  /** 自绘标题栏的窗口控制通道：动作只作用于发起方自己的窗口（按 sender 定位，天然多窗安全） */
  registerWindowControls(): void {
    ipcMain.handle('window:minimize', (event) => {
      BrowserWindow.fromWebContents(event.sender)?.minimize()
    })
    ipcMain.handle('window:toggle-maximize', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win)
        return
      if (win.isMaximized())
        win.unmaximize()
      else
        win.maximize()
    })
    ipcMain.handle('window:close', (event) => {
      BrowserWindow.fromWebContents(event.sender)?.close()
    })
  }

  /** 平台事件广播：EventBus 全量事件转发给所有存活窗口的渲染层（渲染层经 bridge.onEvent 订阅） */
  attachEventBroadcast(events: EventBus): void {
    events.onAny((name, payload) => {
      for (const win of this.windows.values()) {
        if (!win.isDestroyed())
          win.webContents.send(`event:${name}`, payload)
      }
    })
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
