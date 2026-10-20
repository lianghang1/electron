/**
 * 浮层窗 URL hash 契约：同一 renderer 入口按 hash 分流「浮层页 / Shell 框架」两种形态。
 * Main 创建浮层窗（编码）与入口/浮层页（解码）共用本契约，
 * 防止两处手写判定漂移（如严格相等匹配漏掉带 query 的 hash）。
 *
 * 格式：`#/overlay?kind=<kind>`，panel 为缺省用途、仍显式携带 kind 保持格式统一。
 */

/** 浮层页 hash 前缀 */
export const OVERLAY_HASH = '#/overlay'

/** 浮层窗用途：决定页面初始 sync 分发与渲染分支 */
export type OverlayWindowKind = 'panel' | 'dialog' | 'menu' | 'capture' | 'config' | 'app-center'

const KINDS: readonly OverlayWindowKind[] = ['panel', 'dialog', 'menu', 'capture', 'config', 'app-center']

/** 编码浮层窗加载 hash：`#/overlay?kind=<kind>` */
export function buildOverlayHash(kind: OverlayWindowKind): string {
  return `${OVERLAY_HASH}?kind=${kind}`
}

/**
 * 解析窗口 hash：非浮层页返回 null（入口据此挂载 Shell 框架）；
 * 浮层页返回用途 kind，未携带或非法 kind 归一为缺省 panel。
 */
export function parseOverlayHash(hash: string): OverlayWindowKind | null {
  if (hash !== OVERLAY_HASH && !hash.startsWith(`${OVERLAY_HASH}?`)) { return null }
  const kind = new URLSearchParams(hash.slice(OVERLAY_HASH.length)).get('kind') ?? ''
  const matched = KINDS.find(item => item === kind)
  return matched ?? 'panel'
}
