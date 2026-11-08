/**
 * 边界校验基座：版本比较、源站匹配、路径段与下载目标。
 * 更新通道、窗口导航、设备域共用同一套判定，避免每处各写一份而口径不一。
 */

/** 语义版本比较：数值段逐段比较；数值相等时按 semver 处理预发布（正式版 > 预发布版）。返回 -1/0/1。 */
export function compareVersions(left: string, right: string): -1 | 0 | 1 {
  const parse = (v: string): { core: number[], pre: (number | string)[] } => {
    const [head, ...rest] = v.replace(/^v/i, '').split('-')
    const segments = head.split('.')
    // 数值段必须是十进制数字；畸形版本整体退化为 0，不参与预发布比较
    if (segments.length === 0 || segments.some(seg => !/^\d+$/.test(seg))) {
      return { core: [0], pre: [] }
    }
    const core = segments.map(seg => Number.parseInt(seg, 10))
    const pre = rest.join('-').split('.').map((seg) => {
      const n = Number.parseInt(seg, 10)
      return /^\d+$/.test(seg) && Number.isFinite(n) ? n : seg
    })
    return { core, pre: rest.length ? pre : [] }
  }
  const a = parse(left)
  const b = parse(right)
  const len = Math.max(a.core.length, b.core.length)
  for (let i = 0; i < len; i++) {
    const x = a.core[i] ?? 0
    const y = b.core[i] ?? 0
    if (x > y) { return 1 }
    if (x < y) { return -1 }
  }
  // 主版本相同：无预发布的一方更大（2.0.0 > 2.0.0-alpha.0）
  if (a.pre.length === 0 && b.pre.length > 0) { return 1 }
  if (a.pre.length > 0 && b.pre.length === 0) { return -1 }
  const plen = Math.max(a.pre.length, b.pre.length)
  for (let i = 0; i < plen; i++) {
    const x = a.pre[i]
    const y = b.pre[i]
    if (x === undefined) { return -1 }
    if (y === undefined) { return 1 }
    if (x === y) { continue }
    // 数字段 < 字符串段；同类按各自序比较
    if (typeof x === 'number' && typeof y === 'string') { return -1 }
    if (typeof x === 'string' && typeof y === 'number') { return 1 }
    return x > y ? 1 : -1
  }
  return 0
}

export function isNewer(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0
}

/**
 * 源站匹配：只认协议+主机+端口的精确相等，或显式的 `*.example.com` 子域模式。
 * 不做裸字符串 startsWith——`https://a.com` 不得放行 `https://a.com.evil.com`，
 * 空前缀不得变成全放行。
 */
export function matchesOrigin(url: string, allowed: readonly string[]): boolean {
  if (allowed.length === 0) { return false }
  let target: URL
  try {
    target = new URL(url)
  }
  catch {
    return false
  }
  return allowed.some((pattern) => {
    if (pattern === '*') { return true }
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(2).toLowerCase()
      const host = target.hostname.toLowerCase()
      return host === suffix || host.endsWith(`.${suffix}`)
    }
    try {
      const p = new URL(pattern)
      return p.protocol === target.protocol
        && p.hostname.toLowerCase() === target.hostname.toLowerCase()
        && p.port === target.port
    }
    catch {
      return false
    }
  })
}

/** 校验 URL 落在源站白名单内，否则抛（清单/下载地址统一经此闸门）。 */
export function assertAllowedUrl(url: string, allowedOrigins: readonly string[]): void {
  if (!matchesOrigin(url, allowedOrigins)) {
    throw new Error(`update url origin not allowed: ${url}`)
  }
}

/** 路径段：只允许小写字母开头的 kebab-case，杜绝 `../`、绝对路径、分隔符穿越。 */
const SEGMENT_RE = /^[a-z][a-z0-9-]*$/

export function isSafeSegment(value: string): boolean {
  return SEGMENT_RE.test(value)
}

export function assertSafeSegment(value: string, label = 'id'): void {
  if (!isSafeSegment(value)) {
    throw new Error(`unsafe ${label}: ${value}`)
  }
}

/** 下载目标校验：协议、源站白名单、以及内网/本机地址一律拒绝（SSRF 防线）。 */
export function assertFetchableUrl(raw: string, allowedOrigins: readonly string[]): URL {
  let target: URL
  try {
    target = new URL(raw)
  }
  catch {
    throw new Error(`invalid url: ${raw}`)
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error(`unsupported protocol: ${target.protocol}`)
  }
  if (!matchesOrigin(target.href, allowedOrigins)) {
    throw new Error(`url origin not allowed: ${target.origin}`)
  }
  return target
}

/** 内网/本机主机判定：拒绝 SSRF 指向元数据服务、localhost、私有网段。 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '[::1]') { return true }
  if (/^127\./.test(host) || /^10\./.test(host) || /^169\.254\./.test(host)) { return true }
  if (/^192\.168\./.test(host)) { return true }
  const m = host.match(/^172\.(\d+)\./)
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) { return true }
  return false
}
