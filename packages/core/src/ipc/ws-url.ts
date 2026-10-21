/**
 * IPC 入参的 ws 服务地址校验（scanner HID / idcard ws / signature ws 共用规则）：
 * 仅接受 ws:// 或 wss:// 前缀的绝对地址，其余值一律丢弃不落盘。
 */
export function isWsUrl(value: unknown): value is string {
  return typeof value === 'string' && /^wss?:\/\/.+/i.test(value.trim())
}
