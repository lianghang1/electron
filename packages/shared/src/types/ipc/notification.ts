/**
 * 通知域契约：App 发起平台通知（需声明 notification 权限），
 * Shell 以应用内 toast 呈现——全局统一可定制 UI，不进系统通知中心。
 */
import type { PlatformNotification } from '../notification'

export type NotificationIpc = {
  /** App 发起平台通知：Main 校验权限后转推 Shell */
  'notification:show': (notification: { title: string, body?: string }) => void

  // ---- Main → Renderer 推送 ----
  /** 平台通知全量列表（Main → OverlayWindow 右下角 toast 渲染数据源） */
  'notification:received': [PlatformNotification[]]
}
