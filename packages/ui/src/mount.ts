import type { Component, App as VueApp } from 'vue'
import { parseOverlayHash } from '@desktop/shared'
import { createApp } from 'vue'
import OverlayApp from './overlay/OverlayApp.vue'
import ShellApp from './shell/ShellApp.vue'

/**
 * 平台 renderer 双形态入口（单点收敛）：
 * #/overlay 开头的 hash 是浮层原生窗的页面（右键菜单 / 权限弹窗 / 设备浮层等，经
 * OverlayApp 渲染），其余情况挂载调用方传入的 Shell/业务根组件。
 * setup 仅在业务页面分支应用——浮层窗不挂 router/store（hash 语义不同，会互相污染）。
 * 浮层 hash 编解码单点在 shared overlay-contract。
 */
export function mountPlatformApp(shell: Component, setup?: (app: VueApp) => void): void {
  const isOverlay = parseOverlayHash(window.location.hash) !== null
  const app = createApp(isOverlay ? OverlayApp : shell)
  if (!isOverlay) {
    setup?.(app)
  }
  app.mount('#app')
}

/** Desktop Shell 预设：Shell 整体内置于 ui 包，应用侧入口零 Shell 代码 */
export function mountShellApp(): void {
  mountPlatformApp(ShellApp)
}
