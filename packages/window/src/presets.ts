/**
 * 窗口基础选项常量：组合出各目的窗口的共性。
 * 对外永远不暴露这些原始组合——外部只见目的命名函数。
 */
import type { BrowserWindowConstructorOptions } from 'electron'
import process from 'node:process'
import { SECURE_WEB_PREFERENCES } from './security'

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

/**
 * 工作台基础：隐藏系统标题栏（自绘 chrome）+ 平台透明视觉（启动期透出桌面/材质）。
 * show: false 创建后由 createShellWindow 立即 show 上屏（加载/求值间隙 win32 有
 * acrylic 材质打底，不再是「无窗如卡死」）；过场动画由 shell:introBegin（首帧已绘）
 * 驱动，不再依赖 ready-to-show 的 show 时机。
 */
export const shellBase: BrowserWindowConstructorOptions = {
  show: false,
  autoHideMenuBar: true,
  titleBarStyle: 'hidden',
  ...shellVisualOptions(),
  minWidth: 960,
  minHeight: 600,
  // 平台自绘窗口与应用容器同一份安全基线（security.ts），不因「自家页面」豁免
  webPreferences: { ...SECURE_WEB_PREFERENCES },
}

/** 浮层基础：透明 + 无边框 + 不抢焦点显示 */
export const overlayBase: BrowserWindowConstructorOptions = {
  frame: false,
  transparent: true,
  resizable: false,
  show: false,
  backgroundColor: '#00000000',
  webPreferences: { ...SECURE_WEB_PREFERENCES },
}

/** Windows 全屏浮层防停止合成（浮层盖住主窗时主窗画面冻结的 Chromium 特性） */
export const win32OcclusionSwitch = { disableFeatures: 'CalculateNativeWinOcclusion' } as const
