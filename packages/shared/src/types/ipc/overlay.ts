/**
 * 浮层域契约：消息窗（通知 toast / 下载面板）与授权弹窗渲染进独立透明原生窗
 * （OverlayWindow），原生层级永远盖过 WebContentsView——这两类浮层必须覆盖
 * Web 容器区域，只能走原生窗。Tab 右键菜单等 Shell 域内浮层回归 Shell DOM
 * （reka-ui + 视图抑制），不再经过浮层窗。
 * 文件与 core/src/ipc/overlay.ts（注册实现）一一对应。
 */
import type { DownloadTask } from '../download'
import type { PlatformNotification } from '../notification'
import type { PermissionRequest } from '../permission'

/** 浮层页同步状态：页面 mounted 后主动拉取（杜绝 Main 推送早于页面订阅的竞态） */
export interface OverlaySyncState {
  toasts: PlatformNotification[]
  downloads: DownloadTask[]
  /** 挂起中的运行时授权请求（弹窗窗数据源） */
  dialogs: PermissionRequest[]
}

export type OverlayIpc = {
  /**
   * 仅供消息窗页面回报内容高度：消息面板内容动态，
   * 页面渲染后量高回报，Main 据此调整窗口尺寸与位置。
   */
  'overlay:resize': (height: number) => void
  /** 仅供浮层窗页面 mounted 后拉取当前状态（toast / 下载 / 挂起授权请求） */
  'overlay:sync': () => OverlaySyncState
  /** 仅供消息窗页面回传：用户主动关闭面板（清空通知与面板显示，新事件到达时重新弹出） */
  'overlay:dismiss': () => void
  /**
   * 仅供消息窗页面回传：透明窗口鼠标穿透开关（true = 整窗穿透）。
   * Windows 透明窗整个 bounds 都命中鼠标，面板视觉只占右上角一小块——
   * 页面按命中元素切换穿透，避免透明区遮挡下层页面点击。
   */
  'overlay:ignoreMouse': (ignore: boolean) => void
}
