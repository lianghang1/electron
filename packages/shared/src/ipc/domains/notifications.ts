import type { IpcDefs, IpcDomainValue } from '../contract'
import { defineIpcDomain, invoke } from '../contract'

/** 通知展示入参：level 限三态 + info 缺省 */
export interface NotificationInput {
  title: string
  body?: string
  level?: 'info' | 'success' | 'warning' | 'error'
  ttlMs?: number
}

/**
 * 统一消息通道域契约：toast / 通知中心 / 下载卡共用一份 TTL（注册实现在 kernel platform/notification）。
 */
export const notificationsDomain = defineIpcDomain('notifications', {
  show: invoke<(input: NotificationInput) => string>(),
  dismiss: invoke<(id: string) => void>(),
  list: invoke<() => any[]>(),
}) satisfies IpcDomainValue<'notifications', IpcDefs>
