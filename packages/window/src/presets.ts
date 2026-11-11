/**
 * 窗口基础选项常量：组合出各目的窗口的共性。
 * 对外永远不暴露这些原始组合——外部只见目的命名函数。
 */
import type { BrowserWindowConstructorOptions } from 'electron'
import process from 'node:process'

/** 主窗底色透明：启动期透出桌面/系统材质；应用根面不透明，材质只在透明处可见。 */
function shellVisualOptions(): BrowserWindowConstructorOptions {
  if (process.platform === 'darwin') {
    return {
      backgroundColor: '#00000000',
      titleBarStyle: 'hidden',
      vibrancy: 'under-window',
      visualEffectState: 'active',
    }
  }
  if (process.platform === 'win32') {
    return {
      backgroundColor: '#00000000',
      // 窗口控制由 renderer 自绘，禁用原生标题栏避免两套按钮。
      frame: false,
      backgroundMaterial: 'acrylic',
    }
  }
  return {
    backgroundColor: '#00000000',
    // 透明底只负责启动期与根面未覆盖处，应用根面本身不透明。
    transparent: true,
    // 原生标题栏与自绘顶部菜单重复。
    frame: false,
    // 部分 WM 给 frameless 窗口绘制额外外缘描边。
    hasShadow: false,
  }
}

/** 工作台基础：隐藏系统标题栏（自绘 chrome）+ 平台透明视觉（启动期透出桌面/材质） */
export const shellBase: BrowserWindowConstructorOptions = {
  autoHideMenuBar: true,
  titleBarStyle: 'hidden',
  ...shellVisualOptions(),
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
