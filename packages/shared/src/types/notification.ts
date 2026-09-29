/**
 * 平台通知：App 经 notification:show 发起，Main 校验 notification 权限后
 * 推送 Shell 以应用内 toast 呈现（全局统一 UI，可定制，不进系统通知中心）。
 */
export interface PlatformNotification {
  id: string
  appId: string
  appName: string
  title: string
  body: string
  shownAt: number
}
