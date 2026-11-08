import type { EventBus, Startable } from '@shell/kernel'
import { app, Menu, nativeImage, Tray } from 'electron'

/**
 * TraySystem：桌面形态的系统托盘（kiosk 全屏形态不创建）。
 * 职责：快速入口（显示工作台 / 打开应用中心）+ 退出。
 * 关闭到托盘的行为由设置项驱动（general.closeToTray，M6 schema 已留扩展位）。
 */
export class TraySystem implements Startable {
  readonly name = 'tray'
  private tray?: Tray

  constructor(
    private readonly events: EventBus,
    private readonly showShell: () => void,
  ) {}

  async start(): Promise<void> {
    // 空图标：electron 默认托盘占位（品牌图标由 flavor.branding.icon 注入后替换）
    const icon = nativeImage.createEmpty()
    this.tray = new Tray(icon)
    this.tray.setToolTip(app.getName())
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示工作台', click: () => this.showShell() },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          this.events.emit('window.closed', { id: -1 })
          app.quit()
        },
      },
    ]))
    this.tray.on('click', () => this.showShell())
  }

  async stop(): Promise<void> {
    this.tray?.destroy()
    this.tray = undefined
  }
}
