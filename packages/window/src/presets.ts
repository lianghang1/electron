/**
 * 窗口基础选项常量：组合出各目的窗口的共性。
 * 对外永远不暴露这些原始组合——外部只见目的命名函数。
 */
import type { BrowserWindowConstructorOptions } from 'electron'
import process from 'node:process'

/**
 * 工作台主窗平台视觉（对齐 ZCode packages/desktop/src/main/desktopWindowChrome.ts
 * 的 buildDesktopWindowVisualOptions）：
 * - 三平台窗口底色一律透明（#00000000），启动期 renderer 未绘制时透出桌面/系统材质，
 *   启动 logo 悬浮在透明遮罩上（对齐 ZCode 启动观感）；
 * - mac：under-window vibrancy 提供磨砂材质；win：acrylic；linux：transparent + frameless。
 *   mac/win 的材质只在 renderer 透明处可见，应用根面仍是不透明 token，不混入桌面底色。
 */
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
      // Windows 窗口操作由 renderer 自绘按钮承担，禁用原生标题栏，避免出现两套按钮。
      frame: false,
      backgroundMaterial: 'acrylic',
    }
  }
  return {
    backgroundColor: '#00000000',
    // 不透明 BrowserWindow 会把 renderer 的圆角裁切重新填成直角底色；
    // 透明底只负责启动期与应用根面未覆盖处透出桌面，应用根面本身仍用不透明 token。
    transparent: true,
    // Linux 原生标题栏会和 renderer 自绘顶部菜单重复，隐藏 frame 统一用自绘窗口控制。
    frame: false,
    // Linux 部分窗口管理器会给 frameless 窗口绘制额外外侧阴影/描边（外缘黑线），
    // 只在 Linux 禁用系统阴影，避免影响 macOS/Windows 的原生材质。
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
