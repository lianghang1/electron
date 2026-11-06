/**
 * 窗口基础选项常量：组合出各目的窗口的共性。
 * 对外永远不暴露这些原始组合——外部只见目的命名函数（铁律二）。
 */
import type { BrowserWindowConstructorOptions } from 'electron'

/** 工作台基础：隐藏系统标题栏（自绘 chrome）+ 防启动闪白底色 */
export const shellBase: BrowserWindowConstructorOptions = {
  autoHideMenuBar: true,
  titleBarStyle: 'hidden',
  backgroundColor: '#eef3fb',
  minWidth: 960,
  minHeight: 600,
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
}

/** 浮层基础：透明 + 无边框 + 不抢焦点显示 */
export const overlayBase: BrowserWindowConstructorOptions = {
  frame: false,
  transparent: true,
  resizable: false,
  show: false,
  backgroundColor: '#00000000',
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
}

/** Windows 全屏浮层防停止合成（浮层盖住主窗时主窗画面冻结的 Chromium 特性） */
export const win32OcclusionSwitch = { disableFeatures: 'CalculateNativeWinOcclusion' } as const
