import type { Permission } from '@desktop/shared'
import type { BrowserWindow, WebContentsView } from 'electron'
import { shell } from 'electron'

/**
 * 平台权限 → Chromium session 权限名的映射：manifest.permissions 里
 * 与 session 能力对应的部分按此放行，其余平台权限（storage / download ...）
 * 由 Main 的 IPC 通道 assert 单独把守，session 层没有对应能力，不做映射。
 */
const PLATFORM_TO_SESSION: Partial<Record<Permission, string>> = {
  'clipboard.read': 'clipboard-read',
  'clipboard.write': 'clipboard-sanitized-write',
  'notification': 'notifications',
}

/** manifest.permissions 中可落地的 session 权限（Shell 逃生口不受此限，直接传 Chromium 名） */
export function toSessionPermissions(permissions: readonly Permission[]): string[] {
  return permissions
    .map(p => PLATFORM_TO_SESSION[p])
    .filter((v): v is string => Boolean(v))
}

/**
 * Shell 窗口的"保险"，防的是页面里的恶意或意外行为，不拦正常业务：
 * 1. 页面想跳到别的网站 → 本窗口不放行，普通链接交给系统浏览器打开
 * 2. window.open 想弹新窗口 → 一律不批
 * 3. 网页申请权限 → 默认全拒，放行范围由 allowedPermissions 决定
 *
 * 业务功能都走 IPC，跟这三条路不沾边，正常使用完全无感。
 */
export function applyWebContentsGuards(
  win: BrowserWindow,
  appOrigin: string | null,
  allowedPermissions: 'all' | string[] = [],
): void {
  const { webContents } = win

  // 页面"跳走"之前会先到这里：自己人放行，外人拦下
  webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url, appOrigin))
      return
    event.preventDefault()
    // 普通网页链接转交系统浏览器，用户点外链的预期不受影响
    if (/^https?:\/\//.test(url))
      shell.openExternal(url)
  })

  // 想开新窗口（window.open、target="_blank"）→ 一律不批
  webContents.setWindowOpenHandler((details) => {
    if (/^https?:\/\//.test(details.url))
      shell.openExternal(details.url)
    return { action: 'deny' }
  })

  applySessionPermissionGuards(win.webContents.session, allowedPermissions)
}

/**
 * Web App 容器的导航策略：只允许 manifest 声明的 Origin 内跳转
 * （缺省 = entry.url 的 Origin），外部域名拦截并转交系统浏览器；新窗口一律拒绝。
 */
export function applyWebAppGuards(view: WebContentsView, allowedOrigins: string[]): void {
  view.webContents.on('will-navigate', (event, url) => {
    if (isAllowedOrigin(url, allowedOrigins))
      return
    event.preventDefault()
    if (/^https?:\/\//.test(url))
      shell.openExternal(url)
  })

  view.webContents.setWindowOpenHandler((details) => {
    if (/^https?:\/\//.test(details.url))
      shell.openExternal(details.url)
    return { action: 'deny' }
  })
}

/**
 * Session 级权限白名单：基础项（复制粘贴）+ 声明（'all' 或数组），其余一律拒绝。
 * Web App 的 Session 由 WebService 挂 guard，同一 Session 只挂一次。
 */
export function applySessionPermissionGuards(
  session: Electron.Session,
  allowedPermissions: 'all' | string[] = [],
): void {
  const isAllowed = (permission: string) =>
    permission === 'clipboard-sanitized-write'
    || allowedPermissions === 'all'
    || (Array.isArray(allowedPermissions) && allowedPermissions.includes(permission))
  session.setPermissionRequestHandler((_wc, permission, callback) => {
    if (isAllowed(permission))
      return callback(true)
    console.warn(`[security] denied permission request: ${permission}`)
    callback(false)
  })
  session.setPermissionCheckHandler((_wc, permission) => isAllowed(permission))
}

/**
 * 判断跳转目标是不是 Shell"自己人"：
 * - dev：自己人 = dev server（比对 origin，端口变了也能对上）
 * - 生产：自己人 = 应用自带的 file:// 页面
 * - 地址解析不了的，一律当外人
 */
function isAppUrl(url: string, appOrigin: string | null): boolean {
  try {
    const { protocol, origin } = new URL(url)
    // file:// 没有 origin（URL 解析结果就是 "null"），只能按协议判断
    if (protocol === 'file:')
      return appOrigin === null
    return appOrigin !== null && origin === appOrigin
  }
  catch {
    return false
  }
}

function isAllowedOrigin(url: string, origins: string[]): boolean {
  try {
    return origins.includes(new URL(url).origin)
  }
  catch {
    return false
  }
}
