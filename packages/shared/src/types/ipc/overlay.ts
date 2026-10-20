import type { CaptureDialogSession } from '../devices/capture'
import type { DownloadTask } from '../download'
import type { PlatformNotification } from '../notification'
import type { PermissionRequest } from '../permission'
import { defineDomain, invoke, push } from '../../domain'

/** 菜单项动作：菜单窗回传后由 Main 直接执行对应 service（Shell 无需中转） */
export type TabMenuAction = 'reload' | 'clearCache' | 'clearSite' | 'close'

/** 设备配置浮层类别：设备测试页（业务 tab）经桥发起，浮层窗承载对应配置弹窗 */
export type DeviceConfigKind = 'scanner' | 'capture'

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
  /** 挂起中的设备配置浮层类别（配置窗数据源，null = 无浮层） */
  configKind: DeviceConfigKind | null
  /** 应用中心浮层开关（应用中心窗数据源） */
  appCenterOpen: boolean
}

/**
 * 浮层域契约：消息窗（通知 toast / 下载通知卡）、授权弹窗、Tab 右键菜单、拍摄浮层
 * 渲染进独立透明原生窗（OverlayWindow），原生层级永远盖过 WebContentsView——这些浮层
 * 必须覆盖 Web 容器区域，只能走原生窗。四类浮层窗共用本域：sync 按窗身份分发各自数据，
 * 推送由 Main 定点发给目标窗，各窗只消费自己的通道。
 * 文件与 core/src/ipc/overlay.ts（注册实现）一一对应。
 */
export const overlayDomain = defineDomain('overlay', {
  /**
   * 仅供消息窗页面回报内容高度：消息面板内容动态，
   * 页面渲染后量高回报，Main 据此调整窗口尺寸与位置。
   */
  resize: invoke<(height: number) => void>(),
  /** 仅供浮层窗页面 mounted 后拉取当前状态（按窗身份分发：消息 / 弹窗 / 菜单 / 拍摄） */
  sync: invoke<() => OverlaySyncState>(),
  /**
   * 仅供消息窗页面回传：透明窗口鼠标穿透开关（true = 整窗穿透）。
   * Windows 透明窗整个 bounds 都命中鼠标，面板视觉只占右上角一小块——
   * 页面按命中元素切换穿透，避免透明区遮挡下层页面点击。
   */
  ignoreMouse: invoke<(ignore: boolean) => void>(),
  /** 仅 Shell 发起：打开 Tab 右键菜单浮层窗（原生窗承载，页面内容保持可见） */
  openMenu: invoke<(menu: { tabId: string, appId: string, x: number, y: number }) => void>(),
  /** 仅供菜单窗页面回传：选中菜单项（Main 执行动作后自动关菜单） */
  selectMenu: invoke<(action: TabMenuAction) => void>(),
  /** 仅供菜单窗页面回传：关闭菜单（ESC / 点击菜单外） */
  dismissMenu: invoke<() => void>(),
  /** 仅供拍摄窗页面回传：关闭拍摄浮层（用户点击浮层关闭 / ESC） */
  dismissCapture: invoke<() => void>(),
  /** 业务页发起：打开设备配置浮层窗（扫码枪 / 拍摄设备，全屏遮罩模态盖过 Web 容器区域） */
  openConfig: invoke<(kind: DeviceConfigKind) => void>(),
  /** 仅供配置浮层窗页面回传：关闭配置浮层（用户点击弹窗关闭 / ESC） */
  dismissConfig: invoke<() => void>(),
  /** 仅 Shell 发起：打开应用中心浮层窗（全屏遮罩模态，盖过 Web 容器区域） */
  openAppCenter: invoke<() => void>(),
  /** 仅供应用中心窗页面回传：关闭应用中心（ESC / 遮罩点击 / 关闭按钮） */
  dismissAppCenter: invoke<() => void>(),

  // ---- Main → Renderer 推送 ----
  /** Tab 右键菜单变化推送（菜单窗数据源，null = 已关闭） */
  menuUpdated: push<[TabContextMenu | null]>(),
  /** 拍摄浮层会话变化推送（拍摄窗数据源，null = 已关闭） */
  captureUpdated: push<[CaptureDialogSession | null]>(),
  /** 设备配置浮层变化推送（配置窗数据源，null = 已关闭） */
  configUpdated: push<[DeviceConfigKind | null]>(),
  /** 应用中心浮层开关推送（应用中心窗数据源） */
  appCenterUpdated: push<[boolean]>(),
})
