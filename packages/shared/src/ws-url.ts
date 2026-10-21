/**
 * ws 服务地址校验（跨 Main / Renderer 共用规则）：
 * 仅接受 ws:// 或 wss:// 前缀的绝对地址。主进程侧用于 IPC 入参收敛（不落盘非法值），
 * 渲染层侧用于设置面板保存前校验（两端同规则，避免 UI 放行而 sanitize 拒绝的体验落差）。
 */
export function isWsUrl(value: unknown): value is string {
  return typeof value === 'string' && /^wss?:\/\/.+/i.test(value.trim())
}
