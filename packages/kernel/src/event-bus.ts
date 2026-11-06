import type { PlatformEventName, PlatformEvents } from '@shell/shared'

type Handler<T> = (payload: T) => void

/**
 * 类型化事件总线：事件名与载荷由 PlatformEvents 契约约束，
 * emit/on 的事件名拼错编译期即报。
 */
export class EventBus {
  private handlers = new Map<PlatformEventName, Set<Handler<never>>>()

  on<K extends PlatformEventName>(event: K, handler: Handler<PlatformEvents[K]>): () => void {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    set.add(handler as Handler<never>)
    return () => set!.delete(handler as Handler<never>)
  }

  emit<K extends PlatformEventName>(event: K, payload: PlatformEvents[K]): void {
    const set = this.handlers.get(event)
    if (!set)
      return
    for (const handler of set)
      (handler as Handler<PlatformEvents[K]>)(payload)
  }
}
