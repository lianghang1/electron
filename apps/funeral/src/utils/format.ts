/**
 * 班次类页面的展示格式化。
 */

/** 完整时间戳截取为 HH:mm（已是 HH:mm 则原样返回） */
function toHm(time?: string): string {
  if (!time)
    return ''
  return time.length > 5 ? time.slice(11, 16) : time
}

/** 时段显示：09:00 - 10:00 */
export function fmtSlot(start?: string, end?: string): string {
  const s = toHm(start)
  const e = toHm(end)
  if (!s && !e)
    return '—'
  if (!e || s === e)
    return s
  return `${s} - ${e}`
}
