/** 契约日期字段（统一格式 YYYY-MM-DD，见 IdCardData）：设备原始日期串归一化 */
export function normalizeCardDate(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` : raw.trim()
}
