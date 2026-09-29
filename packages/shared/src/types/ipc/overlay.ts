/**
 * 浮层域契约：全局菜单/弹窗渲染进独立透明原生窗（OverlayWindow），
 * 原生层级永远盖过 WebContentsView，从根上解决浮层被 Web 内容遮挡。
 * 文件与 core/src/ipc/overlay.ts（注册实现）一一对应。
 */
import type { DownloadTask } from '../download'
import type { PlatformNotification } from '../notification'
import type { PermissionRequest } from '../permission'

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

/** 浮层页同步状态：页面 mounted 后主动拉取（杜绝 Main 推送早于页面订阅的竞态） */
export interface OverlaySyncState {
  /** 当前展示中的菜单（null = 无）；窗口就绪前到达的展示请求留存于此 */
  menu: OverlayMenuConfig | null
  toasts: PlatformNotification[]
  downloads: DownloadTask[]
  dialogs: PermissionRequest[]
}

export type OverlayIpc = {
  'overlay:showMenu': (config: OverlayMenuConfig) => void
  'overlay:hideMenu': () => void
  /** 仅供 OverlayWindow 页面回传用户动作；Main 校验来源后转发并隐藏浮层 */
  'overlay:action': (itemId: string) => void
  /**
   * 仅供 OverlayWindow 页面回报内容高度：消息/弹窗类浮层内容动态，
   * 页面渲染后量高回报，Main 据此调整对应浮层窗尺寸与位置。
   */
  'overlay:resize': (height: number) => void
  /** 仅供 OverlayWindow 页面 mounted 后拉取当前状态（菜单 / toast / 下载 / 挂起授权请求） */
  'overlay:sync': () => OverlaySyncState

  // ---- Main → Renderer 推送 ----
  /** Main → Shell：浮层菜单用户动作（收到即菜单已收起） */
  'overlay:menuAction': [string]
  /** Main → OverlayWindow：展示菜单配置（含定位与主题） */
  'overlay:show': [OverlayMenuConfig]
}
