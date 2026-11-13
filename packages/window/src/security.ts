import { matchesOrigin, sessionToPlatformPermission } from '@shell/shared'
import { desktopCapturer, shell } from 'electron'

/**
 * 平台受管容器（应用视图 / 受管弹窗）的 webPreferences 安全基线：写死不配置。
 * 任何新容器创建点都必须展开此常量，禁止按调用方需求放宽单项。
 */
export const SECURE_WEB_PREFERENCES = {
  sandbox: true,
  contextIsolation: true,
  webSecurity: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webviewTag: false,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
} as const

/**
 * Session 权限应答的两类能力（Chromium 会话级 handler 的两段式：check 预检 → request 应答）：
 *
 * - SYNC_GRANT：浏览器语义本就不询问用户的能力（全屏 / 指针锁定），且异步应答存在
 *   「用户手势在等待弹窗期间过期」的结构性问题（Electron 39 实测：全屏首次授权不生效，
 *   异步拒绝还会毒化会话致 requestFullscreen 永不再派发）——request 阶段同步放行。
 * - ASYNC_APPROVAL：敏感能力（媒体 / 定位 / 屏幕捕获），check 阶段放行使请求得以派发，
 *   request 阶段转权限闸门（策略表 → 持久化结论 → 授权浮层）。
 *
 * 其余能力（通知 / 剪贴板读取等只走 check 的）保持声明制，未声明在 check 阶段即拒绝。
 */
const SYNC_GRANT = new Set(['fullscreen', 'pointerLock'])
const ASYNC_APPROVAL = new Set(['media', 'geolocation', 'display-capture'])
/** 基础写：复制粘贴语义，不设门槛 */
const BASE_GRANT = 'clipboard-sanitized-write'

const guardedSessions = new WeakSet<Electron.Session>()

export interface SessionGuardOptions {
  /** 声明的平台权限（manifest.permissions）；'all' = 平台自身窗口 */
  declared: 'all' | readonly string[]
  callerOf: (webContentsId: number) => { appId: string } | undefined
  gate: (appId: string, permission: string) => Promise<boolean>
}

/**
 * Session 级权限闸门：同一 Session 只挂一次。
 * request 阶段：基础写与 SYNC_GRANT 同步放行，其余按调用方身份走权限闸门（异步），
 * 闸门链路（策略表 → 持久化结论 → 授权浮层）异常一律按拒绝落定，页面请求不悬挂。
 */
export function installSessionGuards(session: Electron.Session, options: SessionGuardOptions): void {
  if (guardedSessions.has(session)) { return }
  guardedSessions.add(session)
  const { declared, callerOf, gate } = options
  const isDeclared = (permission: string): boolean =>
    declared === 'all' || declared.includes(permission)

  session.setPermissionRequestHandler((requesting, chromiumPermission, callback) => {
    if (chromiumPermission === BASE_GRANT || SYNC_GRANT.has(chromiumPermission)) {
      callback(true)
      return
    }
    const caller = callerOf(requesting.id)
    const permission = sessionToPlatformPermission(chromiumPermission)
    if (!caller || !permission) {
      console.warn(`[security] denied permission request: ${chromiumPermission}`)
      callback(false)
      return
    }
    void gate(caller.appId, permission)
      .then(allowed => callback(allowed))
      .catch(() => callback(false))
  })

  // 同步 check：基础写 + SYNC_GRANT + ASYNC_APPROVAL 放行（真正的关卡各自在 request）；
  // 其余按声明判定——通知 / 剪贴板读取只有 check 环节，声明即答案
  session.setPermissionCheckHandler((_wc, chromiumPermission) => {
    if (chromiumPermission === BASE_GRANT || SYNC_GRANT.has(chromiumPermission) || ASYNC_APPROVAL.has(chromiumPermission)) { return true }
    const permission = sessionToPlatformPermission(chromiumPermission)
    return permission !== undefined && isDeclared(permission)
  })

  // 屏幕捕获源提供：display-capture 的权限请求过闸后才会走到这里，取主屏；
  // 枚举失败按无可用源处理（Chromium 收到空负载等同拒绝捕获）
  session.setDisplayMediaRequestHandler((_request, callback) => {
    void desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback(sources.length ? { video: sources[0] } : {})
    }).catch(() => {
      callback({})
    })
  })
}

/**
 * Web 容器导航策略：只允许声明的 origin 白名单内跳转，白名单外拦截；
 * 普通外链转交系统浏览器（用户点外链的预期不受影响）。
 * window.open / target=_blank：目标在白名单内 → 交给 openPopup 由平台创建受管弹窗；
 * 其余一律拒绝自动开窗（外链转系统浏览器）。
 */
export function applyNavigationGuards(
  webContents: Electron.WebContents,
  allowedOrigins: readonly string[],
  openPopup?: (url: string, features?: string) => void,
): void {
  webContents.on('will-navigate', (event, url) => {
    if (matchesOrigin(url, [...allowedOrigins])) { return }
    event.preventDefault()
    if (/^https?:\/\//.test(url)) { void shell.openExternal(url) }
  })

  webContents.setWindowOpenHandler(({ url, features }) => {
    if (openPopup && matchesOrigin(url, [...allowedOrigins])) {
      openPopup(url, features)
      return { action: 'deny' }
    }
    if (/^https?:\/\//.test(url)) { void shell.openExternal(url) }
    return { action: 'deny' }
  })
}

/** window.open features 中的尺寸解析：钳制到可用下限之上，缺省 800×600 */
export function parsePopupFeatures(features?: string): { width: number, height: number } {
  const size = { width: 800, height: 600 }
  if (!features) { return size }
  for (const item of features.split(',')) {
    const [key, raw] = item.split('=')
    const value = Number(raw)
    if (key === 'width' && Number.isFinite(value) && value >= 320) { size.width = Math.round(value) }
    if (key === 'height' && Number.isFinite(value) && value >= 240) { size.height = Math.round(value) }
  }
  return size
}
