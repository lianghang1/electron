import type { EventBus, Startable } from '@shell/kernel'
import type { NativeImage } from 'electron'
import { app, Menu, nativeImage, Tray } from 'electron'

/** 托盘菜单项（退出由本系统统一追加）：组合根按 flavor 查表装配 */
export interface TrayEntry {
  label: string
  click: () => void
}

/**
 * TraySystem：桌面形态的系统托盘（kiosk 全屏形态不创建）。
 * 菜单与图标点击动作由组合根按锚定档位注入：shell 锚 = 显示工作台，
 * screen 锚（agent 服务形态）= 打开设置卡等托盘入口。
 * 关闭到托盘的行为由设置项驱动（general.closeToTray）。
 */
export class TraySystem implements Startable {
  readonly name = 'tray'
  private tray?: Tray

  constructor(
    private readonly events: EventBus,
    private readonly entries: readonly TrayEntry[],
    /** 托盘图标左键点击动作（与首项同义，快速入口） */
    private readonly onClick: () => void,
    /** 品牌图标（组合根解析资产注入）；缺省空图时 Windows 托盘显示系统默认白框 */
    private readonly icon: NativeImage = nativeImage.createEmpty(),
  ) {}

  async start(): Promise<void> {
    this.tray = new Tray(this.icon)
    this.tray.setToolTip(app.getName())
    this.tray.setContextMenu(Menu.buildFromTemplate([
      ...this.entries.map(entry => ({ label: entry.label, click: () => entry.click() })),
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          this.events.emit('window.closed', { id: -1 })
          app.quit()
        },
      },
    ]))
    this.tray.on('click', () => this.onClick())
  }

  async stop(): Promise<void> {
    this.tray?.destroy()
    this.tray = undefined
  }
}
