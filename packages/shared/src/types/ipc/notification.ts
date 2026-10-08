import type { PlatformNotification } from '../notification'
import { defineDomain, invoke, push } from '../../domain'

/**
 * 通知域契约：App 发起平台通知（需声明 notification 权限），
 * Shell 以应用内 toast 呈现——全局统一可定制 UI，不进系统通知中心。
 */
export const notificationDomain = defineDomain('notification', {
  /** App 发起平台通知：Main 校验权限后转推 Shell */
  show: invoke<(notification: { title: string, body?: string }) => void>(),
  /** 浮层面板关闭单条通知（滑动 / 关闭按钮回传）：仅浮层窗可调用 */
  dismiss: invoke<(toastId: string) => void>(),

  // ---- Main → Renderer 推送 ----
  /** 平台通知全量列表（Main → OverlayWindow 右下角 toast 渲染数据源） */
  received: push<[PlatformNotification[]]>(),
})
