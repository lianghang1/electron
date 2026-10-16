import type { CaptureDialogSession } from '../devices/capture'
import type { DownloadTask } from '../download'
import type { PlatformNotification } from '../notification'
import type { PermissionRequest } from '../permission'
import { defineDomain, invoke, push } from '../../domain'

/** 菜单项动作：菜单窗回传后由 Main 直接执行对应 service（Shell 无需中转） */
export type TabMenuAction = 'reload' | 'clearCache' | 'clearSite' | 'close'

/** Tab 右键菜单：Shell 发起，浮层窗在 (x, y)（主窗内容区坐标）附近渲染菜单卡 */
export interface TabContextMenu {
  /** 菜单实例 id：防止重复打开 / 页面 key 对账 */
  id: string
  tabId: string
  appId: string
  x: number
  y: number
  /** 是否提供「关闭标签页」：Main 按激活 App 的 chrome 配置计算（套壳模式 Tab 固定不关） */
  closable: boolean
}

/** 浮层页同步状态：页面 mounted 后主动拉取（杜绝 Main 推送早于页面订阅的竞态） */
export interface OverlaySyncState {
  toasts: PlatformNotification[]
  downloads: DownloadTask[]
  /** 挂起中的运行时授权请求（弹窗窗数据源） */
  dialogs: PermissionRequest[]
  /** 挂起中的 Tab 右键菜单（菜单窗数据源） */
  menu: TabContextMenu | null
  /** 挂起中的拍摄浮层会话（拍摄窗数据源，null = 无会话） */
  captureSession: CaptureDialogSession | null
}

/**
 * 浮层域契约：消息窗（通知 toast / 下载通知卡）、授权弹窗、Tab 右键菜单渲染进
 * 独立透明原生窗（OverlayWindow），原生层级永远盖过 WebContentsView——这三类浮层
 * 必须覆盖 Web 容器区域，只能走原生窗（菜单窗让页面内容保持可见，无需抑制视图）。
 * 文件与 core/src/ipc/overlay.ts（注册实现）一一对应。
 */
export const overlayDomain = defineDomain('overlay', {
  /**
   * 仅供消息窗页面回报内容高度：消息面板内容动态，
   * 页面渲染后量高回报，Main 据此调整窗口尺寸与位置。
   */
  resize: invoke<(height: number) => void>(),
  /** 仅供浮层窗页面 mounted 后拉取当前状态（toast / 下载 / 挂起授权请求 / 右键菜单） */
  sync: invoke<() => OverlaySyncState>(),
  /**
   * 仅供消息窗页面回传：透明窗口鼠标穿透开关（true = 整窗穿透）。
   * Windows 透明窗整个 bounds 都命中鼠标，面板视觉只占右上角一小块——
   * 页面按命中元素切换穿透，避免透明区遮挡下层页面点击。
   */
  ignoreMouse: invoke<(ignore: boolean) => void>(),
  /** 仅 Shell 发起：打开 Tab 右键菜单浮层窗 */
  menu: invoke<(menu: { tabId: string, appId: string, x: number, y: number }) => void>(),
  /** 仅供菜单窗页面回传：选中菜单项（Main 执行动作后自动关菜单） */
  menuSelect: invoke<(action: TabMenuAction) => void>(),
  /** 仅供菜单窗页面回传：关闭菜单（ESC / 点击菜单外） */
  menuDismiss: invoke<() => void>(),
  /** 仅供拍摄窗页面回传：关闭拍摄浮层（用户点击浮层关闭 / ESC） */
  captureDismiss: invoke<() => void>(),

  // ---- Main → Renderer 推送 ----
  /** Tab 右键菜单变化推送（菜单窗数据源，null = 已关闭） */
  menuPending: push<[TabContextMenu | null]>(),
  /** 拍摄浮层会话变化推送（拍摄窗数据源，null = 已关闭） */
  capturePending: push<[CaptureDialogSession | null]>(),
})
