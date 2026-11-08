/** 灰度判定：设备 ID 白名单优先，其次稳定哈希百分比放量（同设备判定恒定） */
export function isGreylisted(deviceId: string, whitelist: string[], percent: number): boolean {
  if (whitelist.includes(deviceId)) { return true }
  let hash = 0
  for (const ch of deviceId) { hash = (hash * 31 + ch.charCodeAt(0)) >>> 0 }
  return (hash % 100) < percent
}
