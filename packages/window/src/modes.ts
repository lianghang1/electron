import type { BrowserWindow } from 'electron'

/**
 * Kiosk 模式：施加在工作台窗口上的"运行行为"，不是窗口类型。
 * enter 时锁定，exit 时还原；看门狗计数由 WindowSystem 持有。
 */
export interface KioskWatchdog {
  /** 连续崩溃阈值，达到后进入恢复模式（显示自检页）而非无限重启 */
  readonly maxRestarts: number
  readonly restartCount: number
}

export interface KioskMode {
  readonly name: 'kiosk'
  enter(win: BrowserWindow): void
  exit(win: BrowserWindow): void
}

export function createKioskMode(): KioskMode {
  return {
    name: 'kiosk',
    enter(win) {
      win.setKiosk(true)
      win.setMenuBarVisibility(false)
      // 禁右键菜单与 DevTools（生产形态；e2e 构建另行放开）
      win.webContents.on('context-menu', e => e.preventDefault())
    },
    exit(win) {
      win.setKiosk(false)
    },
  }
}

export interface DesktopMode {
  readonly name: 'desktop'
  enter(win: BrowserWindow): void
  exit(win: BrowserWindow): void
}

export function createDesktopMode(): DesktopMode {
  return {
    name: 'desktop',
    enter() {},
    exit() {},
  }
}
