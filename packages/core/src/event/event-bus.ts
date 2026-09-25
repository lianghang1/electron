import type {
  AppInstance,
  AsarUpdateState,
  CallerContext,
  DesktopAppManifest,
  DesktopTab,
  DownloadTask,
  Permission,
  PermissionRequest,
  UpdateState,
} from '@desktop/shared'

/** 平台内部事件：Service 之间解耦通信，仅 Main 进程内使用，不直接跨 IPC */
export interface PlatformEventMap {
  'app:registered': [DesktopAppManifest]
  'app:opened': [AppInstance]
  'app:closed': [AppInstance]
  'tab:created': [DesktopTab]
  'tab:activated': [DesktopTab]
  'tab:closed': [DesktopTab]
  'permission:denied': [{ context: CallerContext, permission: Permission }]
  'permission:request': [PermissionRequest]
  'permission:decided': [{ appId: string, permission: Permission, granted: boolean }]
  'renderer:crashed': [{ appId: string, reason: string }]
  'window:maximizedChanged': [boolean]
  'download:updated': [DownloadTask[]]
  'update:state': [UpdateState]
  'update:asarState': [AsarUpdateState]
}

type Handler = (...args: unknown[]) => void

/** 平台级事件总线：类型安全、单个订阅者异常不影响其他订阅者 */
export class EventBus {
  private handlers = new Map<keyof PlatformEventMap, Set<Handler>>()

  /** 订阅事件，返回取消订阅函数 */
  on<K extends keyof PlatformEventMap>(
    event: K,
    handler: (...args: PlatformEventMap[K]) => void,
  ): () => void {
    const wrapped = handler as Handler
    const existing = this.handlers.get(event)
    if (existing) {
      existing.add(wrapped)
      return () => existing.delete(wrapped)
    }
    const created = new Set<Handler>([wrapped])
    this.handlers.set(event, created)
    return () => created.delete(wrapped)
  }

  emit<K extends keyof PlatformEventMap>(event: K, ...args: PlatformEventMap[K]): void {
    this.handlers.get(event)?.forEach((handler) => {
      try {
        handler(...args)
      }
      catch (error) {
        console.error(`[event-bus] handler error for "${String(event)}"`, error)
      }
    })
  }

  /** 释放全部订阅（Application 退出时调用，防泄漏） */
  clear(): void {
    this.handlers.clear()
  }
}
