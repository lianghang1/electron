/** 字节数 → 可读大小（浮层下载面板用） */
export function formatBytes(bytes: number): string {
  if (bytes <= 0)
    return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(units.length - 1, Math.floor(Math.log2(bytes) / 10))
  return `${(bytes / 2 ** (index * 10)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}
