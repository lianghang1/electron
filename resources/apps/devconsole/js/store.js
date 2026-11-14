import { reactive } from 'vue'

/**
 * 全局状态：调用流水 / 事件流水 / info 快照。
 * 日志有界（新条目在头部，超量截断），避免长会话内存膨胀。
 */
export const store = reactive({
  logs: [],
  events: [],
  info: null,
})

const MAX_LOGS = 300
const MAX_EVENTS = 200

let logSeq = 0
export function pushLog(entry) {
  store.logs.unshift({ id: ++logSeq, ts: Date.now(), ...entry })
  if (store.logs.length > MAX_LOGS) { store.logs.length = MAX_LOGS }
}

let eventSeq = 0
export function pushEvent(name, payload) {
  store.events.unshift({ id: ++eventSeq, ts: Date.now(), name, payload })
  if (store.events.length > MAX_EVENTS) { store.events.length = MAX_EVENTS }
}
