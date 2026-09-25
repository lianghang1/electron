import type { BrowserWindow, Event } from 'electron'
import type { EventBus } from '../event/event-bus'
import type { Logger } from '../logger/logger'
import type { BootstrapOptions } from '../types'
import { is } from '@electron-toolkit/utils'
import { app } from 'electron'
import { SHELL_APP_ID } from '../constants'

/** 崩溃熔断：60s 滑动窗口内崩溃超过该次数停止重载，防崩溃死循环 */
const CRASH_WINDOW_MS = 60_000
const MAX_CRASHES = 5
/** 崩溃重载指数退避：1s 起步，上限 30s */
const BASE_DELAY_MS = 1_000
const MAX_DELAY_MS = 30_000

/**
 * 运行韧性（无人值守场景如 Kiosk，默认全关；Desktop 等有人值守形态不配置）：
 * - crashReload：渲染进程崩溃自动重载，指数退避 + 滑动窗口熔断
 * - autoLaunch：开机自启（系统登录项，仅生产生效，dev 挂的是 electron.exe 无意义）
 * - exitGuard：拦截用户发起的窗口关闭（Alt+F4 等），app.quit() / app.exit() 不受影响
 */
export class ResilienceService {
  /** 崩溃时间戳（熔断滑动窗口） */
  private crashTimes: number[] = []
  private reloadTimer: NodeJS.Timeout | null = null
  /** app.quit() 先触发 before-quit 再走窗口 close，用该标记区分「退出流程」与「用户关窗」 */
  private quitting = false
  private unsubscribers: Array<() => void> = []

  constructor(
    private readonly events: EventBus,
    private readonly logger: Logger,
  ) {}

  /** 主窗口创建后调用一次（崩溃重载与关闭拦截都挂在主窗口上） */
  attach(options: BootstrapOptions, getWindow: () => BrowserWindow | undefined): void {
    const resilience = options.resilience
    if (!resilience)
      return
    if (resilience.crashReload)
      this.attachCrashReload(getWindow)
    if (resilience.autoLaunch !== undefined)
      this.attachAutoLaunch(resilience.autoLaunch)
    if (resilience.exitGuard)
      this.attachExitGuard(getWindow)
  }

  dispose(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer)
      this.reloadTimer = null
    }
    this.unsubscribers.forEach(unsubscribe => unsubscribe())
    this.unsubscribers = []
  }

  /** 崩溃重载：指数退避（1s / 2s / 4s...上限 30s），60s 内超过 5 次熔断并告警 */
  private attachCrashReload(getWindow: () => BrowserWindow | undefined): void {
    const win = getWindow()
    if (!win)
      return
    win.webContents.on('render-process-gone', (_event, details) => {
      if (details.reason === 'clean-exit')
        return
      const now = Date.now()
      this.crashTimes = this.crashTimes.filter(time => now - time < CRASH_WINDOW_MS)
      this.crashTimes.push(now)
      if (this.crashTimes.length > MAX_CRASHES) {
        this.logger.error('crash circuit breaker opened, stop reloading', { reason: details.reason })
        this.events.emit('renderer:crashed', { appId: SHELL_APP_ID, reason: 'reload-circuit-breaker' })
        return
      }
      const delay = Math.min(BASE_DELAY_MS * 2 ** (this.crashTimes.length - 1), MAX_DELAY_MS)
      this.logger.warn(`renderer crashed (${details.reason}), reloading in ${delay}ms`)
      this.reloadTimer = setTimeout(() => {
        this.reloadTimer = null
        if (!win.isDestroyed())
          win.webContents.reload()
      }, delay)
    })
  }

  /** 开机自启：显式 true 开启（仅生产），显式 false 移除，未配置不触碰系统状态 */
  private attachAutoLaunch(enabled: boolean): void {
    if (is.dev) {
      this.logger.debug('autoLaunch skipped in dev (login item would point to electron.exe)')
      return
    }
    app.setLoginItemSettings({ openAtLogin: enabled })
    this.logger.info(`autoLaunch ${enabled ? 'enabled' : 'removed'}`)
  }

  /** 防退出：用户发起的 close 全部拦截，app.quit() 的退出流程放行 */
  private attachExitGuard(getWindow: () => BrowserWindow | undefined): void {
    const win = getWindow()
    if (!win)
      return
    const markQuitting = (): void => {
      this.quitting = true
    }
    const onClose = (event: Event): void => {
      if (this.quitting)
        return
      event.preventDefault()
      this.logger.warn('user-initiated close blocked by exitGuard')
    }
    app.on('before-quit', markQuitting)
    win.on('close', onClose)
    this.unsubscribers.push(() => {
      app.removeListener('before-quit', markQuitting)
      if (!win.isDestroyed())
        win.removeListener('close', onClose)
    })
  }
}
