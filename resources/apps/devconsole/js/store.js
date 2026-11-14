import { reactive } from 'vue'

/**
 * 全局状态：调用流水 / 事件流水 / info 快照。
 * 日志有界（新条目在头部，超量截断），避免长会话内存膨胀。
 */
export const store = reactive({
  logs: [],
  events: [],
  info: null,
  /** 顶栏「更新于」时间戳：全局「刷新设备」按钮最近一次触发完成时刻 */
  updatedAt: '',
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

/**
 * 实验流水（平台功能实验室）：语义色由实验预期决定而非调用成败——
 * state: ok=符合预期 / fail=不符 / block=预期拦截 / info=说明。
 */
export function pushTrace(op, state, detail) {
  pushLog({ method: op, ok: state !== 'fail', state, ms: 0, result: detail })
}

/** 记录时间格式：M-D HH:mm:ss（月/日省前导零，区别于顶栏时钟的完整格式） */
export function fmtTime(v) {
  if (!v) { return '—' }
  const d = new Date(v)
  const p = n => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 全局「刷新设备」编排：面板在挂载时登记各自的设备枚举刷新函数，顶栏按钮统一触发全部 */
const refreshers = new Set()
export function registerRefresher(fn) {
  refreshers.add(fn)
  return () => { refreshers.delete(fn) }
}
export function runRefreshers() {
  return Promise.all([...refreshers].map(fn => fn()))
}
