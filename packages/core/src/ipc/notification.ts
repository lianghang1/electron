import type { AppRegistry } from '../app/app-registry'
import type { EventBus } from '../event/event-bus'
import type { PermissionService } from '../permission/permission-service'
import type { CallerResolver } from './caller-context'
import { randomUUID } from 'node:crypto'
import { handle } from './handle'

export interface NotificationIpcDeps {
  registry: AppRegistry
  permissionService: PermissionService
  events: EventBus
  resolver: CallerResolver
}

/** 通知文案的展示钳制：防止超长内容撑破 Shell toast */
const TITLE_MAX = 60
const BODY_MAX = 200

/**
 * 通知域通道注册：App 发起平台通知（声明式权限，未声明直接拒绝），
 * 经事件总线推给 Shell 以应用内 toast 呈现——全局统一可定制 UI，不进系统通知中心。
 */
export function registerNotificationIpc(deps: NotificationIpcDeps): void {
  handle('notification:show', (e, notification) => {
    const context = deps.resolver.resolve(e.sender)
    deps.permissionService.assert(context, 'notification')

    const title = typeof notification?.title === 'string' ? notification.title.trim() : ''
    if (!title)
      throw new Error('[notification] title is required')
    const body = typeof notification?.body === 'string' ? notification.body.trim() : ''

    deps.events.emit('notification:received', {
      id: randomUUID(),
      appId: context.appId,
      appName: deps.registry.get(context.appId)?.name ?? context.appId,
      title: title.slice(0, TITLE_MAX),
      body: body.slice(0, BODY_MAX),
      shownAt: Date.now(),
    })
  })
}
