import type { DownloadTask } from '../download'
import type { PlatformNotification } from '../notification'
import { defineDomain, invoke } from '../../domain'

/** 消息窗同步状态：页面 mounted 后主动拉取（杜绝 Main 推送早于页面订阅的竞态） */
export interface OverlayPanelState {
  toasts: PlatformNotification[]
  downloads: DownloadTask[]
}

/**
 * overlay 域契约 —— 消息窗（通知 toast / 下载通知卡）专属渲染与交互。
 * 授权弹窗 / Tab 右键菜单 / 拍摄浮层分别拆入 permissionDialog / menu / captureDialog 域。
 * 文件与 core/src/ipc/overlay.ts（注册实现）一一对应。
 */
export const overlayDomain = defineDomain('overlay', {
  /**
   * 仅供消息窗页面回报内容高度：消息面板内容动态，
   * 页面渲染后量高回报，Main 据此调整窗口尺寸与位置。
   */
  resize: invoke<(height: number) => void>(),
  /** 仅供消息窗页面 mounted 后拉取当前状态（toast / 下载） */
  sync: invoke<() => OverlayPanelState>(),
  /**
   * 仅供消息窗页面回传：透明窗口鼠标穿透开关（true = 整窗穿透）。
   * Windows 透明窗整个 bounds 都命中鼠标，面板视觉只占右上角一小块——
   * 页面按命中元素切换穿透，避免透明区遮挡下层页面点击。
   */
  ignoreMouse: invoke<(ignore: boolean) => void>(),
})
