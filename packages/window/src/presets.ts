/**
 * 窗口基础选项常量：组合出各目的窗口的共性。
 * 对外永远不暴露这些原始组合——外部只见目的命名函数。
 */
import type { BrowserWindowConstructorOptions } from 'electron'
import process from 'node:process'
import { SECURE_WEB_PREFERENCES } from './security'

/**
 * 主窗平台视觉档位：全程磨砂质感（用户拍板）——启动层与工作台透出系统材质。
 * 材质初始化与首帧绘制的黑帧间隙由上屏时机消化：createShellWindow 在
 * ready-to-show（首帧已绘）才 show，黑帧存在于窗口可见之前，屏幕上不可见。
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
      // 窗口控制由 renderer 自绘，禁用原生标题栏避免两套按钮。
      frame: false,
      // 不设 backgroundColor：显式底色（含透明 alpha）会让 acrylic 材质失效露黑帧
      // （实测 Win11 26H2）；默认底色的求值间隙由 ready-to-show 门闩消化。
      backgroundMaterial: 'acrylic',
    }
  }
  return {
    backgroundColor: '#00000000',
    // 透明底负责磨砂观感（linux 无系统材质，透出桌面）。
    transparent: true,
    // 原生标题栏与自绘顶部菜单重复。
    frame: false,
    // 部分 WM 给 frameless 窗口绘制额外外缘描边。
    hasShadow: false,
  }
}

/**
 * 工作台基础：隐藏系统标题栏（自绘 chrome）+ 全程磨砂视觉。show: false——
 * 上屏时机见 createShellWindow（首帧已绘才 show）；过场动画由
 * shell:introBegin（首帧已绘）驱动。
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
  movable: false,
  minimizable: false,
  maximizable: false,
  hasShadow: false,
  show: false,
  backgroundColor: '#00000000',
  webPreferences: { ...SECURE_WEB_PREFERENCES },
}
