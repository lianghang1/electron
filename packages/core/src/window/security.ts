import type { Permission } from '@desktop/shared'
import type { BrowserWindow } from 'electron'
import { desktopCapturer, shell } from 'electron'

/**
 * 平台权限 → Chromium session 权限名的映射：manifest.permissions 里
 * 与 session 能力对应的部分按此放行，其余平台权限（storage / download ...）
 * 由 Main 的 IPC 通道 assert 单独把守，session 层没有对应能力，不做映射。
 */
const PLATFORM_TO_SESSION: Partial<Record<Permission, string>> = {
  'clipboard.read': 'clipboard-read',
  'clipboard.write': 'clipboard-sanitized-write',
  'notification': 'notifications',
  'media': 'media',
  'geolocation': 'geolocation',
  'fullscreen': 'fullscreen',
  'pointerLock': 'pointerLock',
  'display-capture': 'display-capture',
}

/** manifest.permissions 中可落地的 session 权限（Shell 逃生口不受此限，直接传 Chromium 名） */
export function toSessionPermissions(permissions: readonly Permission[]): string[] {
  return permissions
    .map(p => PLATFORM_TO_SESSION[p])
    .filter((v): v is string => Boolean(v))
}

/** 反查：Chromium session 权限名 → 平台权限（运行时授权推送用），无对应物的返回 undefined */
export function sessionToPlatformPermission(permission: string): Permission | undefined {
  const entry = (Object.entries(PLATFORM_TO_SESSION) as [Permission, string][]).find(
    ([, sessionName]) => sessionName === permission,
  )
  return entry?.[0]
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
 * （缺省 = entry.url 的 Origin），外部域名拦截并转交系统浏览器。
 * 新窗口策略：目标在允许 Origin 内 → 交给 openPopup 由平台创建受管弹窗；
 * 其余一律拒绝（外链转系统浏览器）。Shell 页面不挂此策略（永远拒绝弹窗）。
 */
export function applyWebAppGuards(
  webContents: Electron.WebContents,
  allowedOrigins: string[],
  openPopup?: (url: string, features?: string) => void,
): void {
  webContents.on('will-navigate', (event, url) => {
    if (isAllowedOrigin(url, allowedOrigins))
      return
    event.preventDefault()
    if (/^https?:\/\//.test(url))
      shell.openExternal(url)
  })

  webContents.setWindowOpenHandler((details) => {
    if (isAllowedOrigin(details.url, allowedOrigins)) {
      openPopup?.(details.url, details.features)
      return { action: 'deny' }
    }
    if (/^https?:\/\//.test(details.url))
      shell.openExternal(details.url)
    return { action: 'deny' }
  })
}

/**
 * 运行时授权类 session 权限：同步 check 先放行，异步 request 才真正把关。
 * Chromium 对这类能力（媒体 / 定位 / 全屏 / 鼠标锁定 / 屏幕捕获）在发起请求前
 * 先做同步 permission check——check 不过连 request 都不触发，运行时授权弹窗
 * 链路会整体失效；而通知 / 剪贴板读取只走同步 check、没有 request 环节，
 * 必须保持声明制，不可放进这里。
 */
const RUNTIME_CHECK_THROUGH = new Set(['media', 'geolocation', 'fullscreen', 'pointerLock', 'display-capture'])

/**
 * Session 级权限白名单：基础项（复制粘贴）+ 声明（'all' 或数组），其余一律拒绝。
 * 声明之外但提供 requestApproval 的（Web App 容器），转运行时授权请用户决策；
 * callback 支持异步调用，决策回来前页面请求挂起。
 * Web App 的 Session 由 WebService 挂 guard，同一 Session 只挂一次。
 */
export function applySessionPermissionGuards(
  session: Electron.Session,
  allowedPermissions: 'all' | string[] = [],
  requestApproval?: (wc: Electron.WebContents, permission: string) => Promise<boolean>,
): void {
  const isDeclared = (permission: string) =>
    allowedPermissions === 'all'
    || (Array.isArray(allowedPermissions) && allowedPermissions.includes(permission))
  session.setPermissionRequestHandler((wc, permission, callback) => {
    if (permission === 'clipboard-sanitized-write' || isDeclared(permission))
      return callback(true)
    if (requestApproval) {
      void requestApproval(wc, permission).then(granted => callback(granted))
      return
    }
    console.warn(`[security] denied permission request: ${permission}`)
    callback(false)
  })
  // 同步 check：基础写 + 已声明 + 运行时授权类（后者的真正关卡在 request handler）
  session.setPermissionCheckHandler(
    (_wc, permission) =>
      permission === 'clipboard-sanitized-write' || isDeclared(permission) || RUNTIME_CHECK_THROUGH.has(permission),
  )
  // 屏幕捕获源提供：display-capture 权限请求放行后才会走到这里，取主屏；拒绝时 Chromium 在更早环节已拦
  session.setDisplayMediaRequestHandler((_request, callback) => {
    void desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback(sources.length ? { video: sources[0] } : {})
    })
  })
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
