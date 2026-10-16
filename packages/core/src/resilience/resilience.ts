import type { BrowserWindow, Event } from 'electron'
import type { EventBus } from '../event/event-bus'
import type { Logger } from '../logger/logger'
import type { BootstrapOptions } from '../types'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { app } from 'electron'
import { SHELL_APP_ID } from '../constants'

/** 崩溃熔断：60s 滑动窗口内崩溃超过该次数停止重载，防崩溃死循环 */
const CRASH_WINDOW_MS = 60_000
const MAX_CRASHES = 5
/** 崩溃重载指数退避：1s 起步，上限 30s */
const BASE_DELAY_MS = 1_000
const MAX_DELAY_MS = 30_000
/** 定时重启轮询间隔（分钟级匹配，容忍系统时钟小幅漂移） */
const RESTART_POLL_MS = 60_000

/**
 * 定时重启的更新决策依赖（装配根闭包注入，规避服务创建顺序）：
 * - hasPendingAsar：热更已下载校验待生效（重启即由引导器 apply）
 * - installPackage：整包已下载（退出并安装）
 */
interface RestartDeps {
  /** 热更已下载校验待生效（重启即由引导器 apply） */
  hasPendingAsar: () => boolean
  /** 整包已下载 → quitAndInstall 并返回 true；无则返回 false */
  installPendingPackage: () => boolean
}

/**
 * 运行韧性（无人值守场景如 Kiosk，默认全关；Desktop 等有人值守形态不配置）：
 * - crashReload：渲染进程崩溃自动重载，指数退避 + 滑动窗口熔断
 * - autoLaunch：开机自启（系统登录项，仅生产生效，dev 挂的是 electron.exe 无意义）
 * - exitGuard：拦截用户发起的窗口关闭（Alt+F4 等），app.quit() / app.exit() 不受影响
 * - scheduledRestart：每日定时重启，动作按更新状态择优（热更生效 / 整包安装 / 纯重启）
 */
export class ResilienceService {
  /** 崩溃时间戳（熔断滑动窗口） */
  private crashTimes: number[] = []
  private reloadTimer: NodeJS.Timeout | null = null
  /** app.quit() 先触发 before-quit 再走窗口 close，用该标记区分「退出流程」与「用户关窗」 */
  private quitting = false
  private unsubscribers: Array<() => void> = []
  private restartTimer: NodeJS.Timeout | null = null
  /** 定时重启防重复：记录已触发日期（同一天只重启一次） */
  private lastRestartDay = ''

  constructor(
    private readonly events: EventBus,
    private readonly logger: Logger,
  ) {}

  /** 主窗口创建后调用一次（崩溃重载与关闭拦截都挂在主窗口上） */
  attach(
    options: BootstrapOptions,
    getWindow: () => BrowserWindow | undefined,
    restartDeps?: RestartDeps,
  ): void {
    const resilience = options.resilience
    if (!resilience) { return }
    if (resilience.crashReload) { this.attachCrashReload(getWindow) }
    if (resilience.autoLaunch !== undefined) { this.attachAutoLaunch(resilience.autoLaunch) }
    if (resilience.exitGuard) { this.attachExitGuard(getWindow) }
    if (resilience.scheduledRestart) { this.attachScheduledRestart(resilience.scheduledRestart, restartDeps) }
  }

  dispose(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer)
      this.reloadTimer = null
    }
    if (this.restartTimer) {
      clearInterval(this.restartTimer)
      this.restartTimer = null
    }
    this.unsubscribers.forEach(unsubscribe => unsubscribe())
    this.unsubscribers = []
  }

  /** 崩溃重载：指数退避（1s / 2s / 4s...上限 30s），60s 内超过 5 次熔断并告警 */
  private attachCrashReload(getWindow: () => BrowserWindow | undefined): void {
    const win = getWindow()
    if (!win) { return }
    win.webContents.on('render-process-gone', (_event, details) => {
      if (details.reason === 'clean-exit') { return }
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
        if (!win.isDestroyed()) { win.webContents.reload() }
      }, delay)
    })
  }

  /**
   * 开机自启：dev 跳过（登录项指向 electron.exe 无意义）；打包测试版同样默认不自启，
   * 仅交付构建注入 DESKTOP_AUTO_LAUNCH=1 时生效——本机测试不再被自启骚扰，
   * 显式 false 仍移除登录项（清理历史注册）。
   */
  private attachAutoLaunch(enabled: boolean): void {
    // 显式 false：无条件移除登录项（清理历史注册）
    if (!enabled) {
      app.setLoginItemSettings({ openAtLogin: false })
      this.logger.info('autoLaunch removed')
      return
    }
    // 开启仅在交付构建生效：dev 跳过（登录项指向 electron.exe 无意义），
    // 本机打包测试默认不自启，交付构建注入 DESKTOP_AUTO_LAUNCH=1
    if (is.dev || process.env.DESKTOP_AUTO_LAUNCH !== '1') {
      this.logger.debug(`autoLaunch skipped (dev=${is.dev}, DESKTOP_AUTO_LAUNCH=${process.env.DESKTOP_AUTO_LAUNCH ?? 'unset'})`)
      return
    }
    app.setLoginItemSettings({ openAtLogin: true })
    this.logger.info('autoLaunch enabled')
  }

  /** 防退出：用户发起的 close 全部拦截，app.quit() 的退出流程放行 */
  private attachExitGuard(getWindow: () => BrowserWindow | undefined): void {
    const win = getWindow()
    if (!win) { return }
    const markQuitting = (): void => {
      this.quitting = true
    }
    const onClose = (event: Event): void => {
      if (this.quitting) { return }
      event.preventDefault()
      this.logger.warn('user-initiated close blocked by exitGuard')
    }
    app.on('before-quit', markQuitting)
    win.on('close', onClose)
    this.unsubscribers.push(() => {
      app.removeListener('before-quit', markQuitting)
      if (!win.isDestroyed()) { win.removeListener('close', onClose) }
    })
  }

  /**
   * 定时重启：分钟级轮询匹配时刻（比一次性 setTimeout 更能容忍休眠唤醒/时钟跳变），
   * 同一天只触发一次。动作按更新状态择优：热更生效 > 整包安装 > 纯重启释放内存
   */
  private attachScheduledRestart(
    schedule: { hour?: number, minute?: number },
    restartDeps?: RestartDeps,
  ): void {
    const hour = schedule.hour ?? 3
    const minute = schedule.minute ?? 0
    this.restartTimer = setInterval(() => {
      const now = new Date()
      if (now.getHours() !== hour || now.getMinutes() !== minute) { return }
      const day = now.toDateString()
      if (day === this.lastRestartDay) { return }
      this.lastRestartDay = day
      if (restartDeps?.hasPendingAsar()) {
        this.logger.info('scheduled restart: relaunching to apply pending asar update')
        app.relaunch()
        app.exit(0)
        return
      }
      if (restartDeps?.installPendingPackage()) { return } // quitAndInstall 已接管退出流程
      this.logger.info(`scheduled daily restart at ${hour}:${String(minute).padStart(2, '0')}`)
      app.relaunch()
      app.exit(0)
    }, RESTART_POLL_MS)
  }
}
