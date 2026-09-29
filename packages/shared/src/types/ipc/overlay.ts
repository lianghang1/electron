/**
 * 浮层域契约：全局菜单/弹窗渲染进独立透明原生窗（OverlayWindow），
 * 原生层级永远盖过 WebContentsView，从根上解决浮层被 Web 内容遮挡。
 * 文件与 core/src/ipc/overlay.ts（注册实现）一一对应。
 */
/** 浮层菜单项 */
export interface OverlayMenuItem {
  id: string
  label: string
  /** 危险动作：红色文案 */
  danger?: boolean
  /** 该项上方渲染分隔线 */
  separatorBefore?: boolean
}

export interface OverlayMenuConfig {
  /** Shell 视口内坐标（CSS px），Main 负责换算屏幕坐标并钳制到工作区 */
  x: number
  y: number
  theme: 'light' | 'dark'
  items: OverlayMenuItem[]
}

export type OverlayIpc = {
  'overlay:showMenu': (config: OverlayMenuConfig) => void
  'overlay:hideMenu': () => void
  /** 仅供 OverlayWindow 页面回传用户动作；Main 校验来源后转发并隐藏浮层 */
  'overlay:action': (itemId: string) => void

  // ---- Main → Renderer 推送 ----
  /** Main → Shell：浮层菜单用户动作（收到即菜单已收起） */
  'overlay:menuAction': [string]
  /** Main → OverlayWindow：展示菜单配置（含定位与主题） */
  'overlay:show': [OverlayMenuConfig]
}
