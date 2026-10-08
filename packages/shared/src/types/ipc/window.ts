/**
 * 窗口域契约：始终操作调用来源的窗口。
 * 文件与 core/src/ipc/window.ts（注册实现）一一对应。
 */
export type WindowIpc = {
  'window:minimize': () => void
  'window:maximize': () => void
  'window:restore': () => void
  'window:isMaximized': () => boolean
  'window:close': () => void
  /** 受控退出整个应用（app.quit()）：exitGuard 拦截的是窗口 close，本通道经 before-quit 放行，供界面维护入口调用 */
  'window:quit': () => void

  // ---- Main → Renderer 推送 ----
  /** 窗口最大化状态变化（含标题栏双击等系统触发的场景） */
  'window:maximizedChanged': [boolean]
}
