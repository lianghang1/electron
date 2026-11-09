export type SameSite = 'unspecified' | 'no_restriction' | 'lax' | 'strict'

/** Cookie 快照项：与 Electron CookiesSetDetails 对齐的最小集 */
export interface StoredCookie {
  url: string
  name: string
  value: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  expirationDate?: number
  sameSite?: SameSite
}

/** 可序列化来源：Electron Cookie 与快照项共有字段 */
export interface CookieLike {
  name: string
  value: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  expirationDate?: number
  sameSite?: string
}

const SAME_SITE: readonly string[] = ['unspecified', 'no_restriction', 'lax', 'strict']

/**
 * Chromium 不把会话 cookie（无过期时间）写盘，重启即丢；依赖它维持登录态的站点
 * 每次启动都要重新登录。快照把分区内全部 cookie 落盘，回放时会话 cookie 仍是会话 cookie。
 */
export function cookieUrl(cookie: Pick<CookieLike, 'secure' | 'domain' | 'path'>): string {
  const protocol = cookie.secure ? 'https' : 'http'
  const host = cookie.domain?.startsWith('.') ? cookie.domain.slice(1) : (cookie.domain ?? '')
  return `${protocol}://${host}${cookie.path || '/'}`
}

export function serializeCookie(cookie: CookieLike): StoredCookie {
  const sameSite = cookie.sameSite && SAME_SITE.includes(cookie.sameSite)
    ? cookie.sameSite as SameSite
    : undefined
  return {
    url: cookieUrl(cookie),
    name: cookie.name,
    value: cookie.value,
    ...(cookie.domain ? { domain: cookie.domain } : {}),
    ...(cookie.path ? { path: cookie.path } : {}),
    ...(cookie.secure !== undefined ? { secure: cookie.secure } : {}),
    ...(cookie.httpOnly !== undefined ? { httpOnly: cookie.httpOnly } : {}),
    ...(cookie.expirationDate !== undefined ? { expirationDate: cookie.expirationDate } : {}),
    ...(sameSite ? { sameSite } : {}),
  }
}

/** 快照损坏不能让应用起不来：逐项校验，畸形项直接跳过 */
export function parseCookieSnapshot(raw: unknown): StoredCookie[] {
  if (!Array.isArray(raw)) { return [] }
  const out: StoredCookie[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') { continue }
    const c = item as Record<string, unknown>
    if (typeof c.url !== 'string' || typeof c.name !== 'string' || typeof c.value !== 'string') { continue }
    const parsed: StoredCookie = { url: c.url, name: c.name, value: c.value }
    if (typeof c.domain === 'string') { parsed.domain = c.domain }
    if (typeof c.path === 'string') { parsed.path = c.path }
    if (typeof c.secure === 'boolean') { parsed.secure = c.secure }
    if (typeof c.httpOnly === 'boolean') { parsed.httpOnly = c.httpOnly }
    if (typeof c.expirationDate === 'number') { parsed.expirationDate = c.expirationDate }
    if (typeof c.sameSite === 'string' && SAME_SITE.includes(c.sameSite)) { parsed.sameSite = c.sameSite as SameSite }
    out.push(parsed)
  }
  return out
}
