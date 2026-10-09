export type NotificationType = 'error' | 'warning' | 'success' | 'info'

export interface Props {
  overlay?: boolean
  // 是否显示通知
  isVisible?: boolean
  // 通知类型
  type?: NotificationType
  // 通知标题
  title?: string
  // 通知消息
  message?: string
  // 自动关闭时间（毫秒），0表示不自动关闭
  autoClose?: number
  // 是否显示进度条
  showProgressBar?: boolean
  // 是否允许点击遮罩层关闭
  closeOnOverlayClick?: boolean
}
