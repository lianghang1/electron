import type { BrowserWindow, Event } from 'electron'
import type { Logger } from '../logger/logger'
import { app, Menu, nativeImage, Tray } from 'electron'

export interface TrayServiceDeps {
  /** 托盘图标（png/ico 绝对路径，来自 BootstrapOptions.icon 的 ?asset 产物） */
  iconPath: string
  /** 托盘悬浮提示（应用名） */
  title: string
  getWindow: () => BrowserWindow | undefined
  /** 「设置」动作：系统设置浮层以主窗为 parent，点击时先唤起主窗再回调 */
  openSettings: () => void
  logger: Logger
}

/**
 * 系统托盘（features.tray 开启时装配）：用户关闭主窗 = 隐藏到托盘，
 * 托盘「退出」/ app.quit() 才真正结束进程。close 拦截沿用 exitGuard 的
 * before-quit 标记模式——退出流程中的 close 放行，保证更新重启链路不受影响。
 */
export class TrayService {
  private tray: Tray | null = null
  /** 摘除 close 拦截与 before-quit 监听（will-quit 释放用） */
  private detach: (() => void) | null = null

  constructor(private readonly deps: TrayServiceDeps) {}

  /** 创建托盘并接管主窗 close 事件（主窗创建后调用，一次即可） */
  attach(win: BrowserWindow): void {
    const icon = nativeImage.createFromPath(this.deps.iconPath)
    this.tray = new Tray(icon)
    this.tray.setToolTip(this.deps.title)
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => this.showWindow() },
      {
        label: '设置',
        click: () => {
          this.showWindow()
          this.deps.openSettings()
        },
      },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ]))
    // 左键点托盘 = 恢复主窗（macOS 设了右键菜单后左键弹菜单，本事件不触发，走菜单项）
    this.tray.on('click', () => this.showWindow())

    // 用户发起的 close → 隐藏留驻托盘；app.quit() 的退出流程放行（before-quit 先于窗口 close）
    let quitting = false
    const markQuitting = (): void => {
      quitting = true
    }
    const onClose = (event: Event): void => {
      if (quitting) { return }
      event.preventDefault()
      win.hide()
    }
    app.on('before-quit', markQuitting)
    win.on('close', onClose)
    this.detach = () => {
      app.removeListener('before-quit', markQuitting)
      if (!win.isDestroyed()) {
        win.removeListener('close', onClose)
      }
    }
    this.deps.logger.info('system tray attached')
  }

  /** will-quit 释放：摘 close 拦截与托盘图标（不摘会残留幽灵图标） */
  destroy(): void {
    this.detach?.()
    this.detach = null
    this.tray?.destroy()
    this.tray = null
  }

  private showWindow(): void {
    const win = this.deps.getWindow()
    if (!win || win.isDestroyed()) { return }
    if (win.isMinimized()) {
      win.restore()
    }
    else {
      win.show()
    }
    win.focus()
  }
}
