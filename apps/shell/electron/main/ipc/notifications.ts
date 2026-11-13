import type { PermissionService } from '@shell/app-runtime'
import type { NotificationCenter } from '@shell/kernel'
import type { CallerRegistry } from '@shell/shared'
import { registerIpcDomain } from '@shell/bridge/handle'
import { notificationsDomain } from '@shell/shared/ipc'
import { authorized } from './caller'

export interface NotificationsIpcDeps {
  callers: CallerRegistry
  permissions: PermissionService
  notifications: NotificationCenter
}

/** notifications 域注册：toast / 通知中心 / 下载卡共用一份 TTL */
export function registerNotificationsIpc(deps: NotificationsIpcDeps): void {
  registerIpcDomain(notificationsDomain, {
    show: async (e, input) => {
      await authorized(deps, e.sender.id, 'notification')
      const level = input.level === 'success' || input.level === 'warning' || input.level === 'error' ? input.level : 'info'
      return deps.notifications.push({ title: String(input.title), body: input.body, level, ttlMs: input.ttlMs })
    },
    dismiss: async (e, id) => {
      await authorized(deps, e.sender.id, 'notification')
      deps.notifications.dismiss(id)
    },
    list: async (e) => {
      await authorized(deps, e.sender.id, 'notification')
      return [...deps.notifications.list()]
    },
  })
}
