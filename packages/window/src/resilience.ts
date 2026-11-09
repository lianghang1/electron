import type { EventBus, Startable } from '@shell/kernel'
import type { Logger } from '@shell/kernel/logger'
import type { BrowserWindow, Event } from 'electron'
import type { ResiliencePolicy, ResilienceRestartDeps } from './resilience-policy'
import { app } from 'electron'
import {
  CRASH_WINDOW_MS,
  isCircuitOpen,
  nextCrashDelay,
  resolveRestartAction,
  RESTART_POLL_MS,
} from './resilience-policy'

export class ResilienceSystem implements Startable {
  readonly name = 'resilience'
  /** 崩溃时间戳（熔断滑动窗口） */
  private crashTimes: number[] = []
  private reloadTimer: NodeJS.Timeout | null = null
  private restartTimer: NodeJS.Timeout | null = null
  /** app.quit() 先触发 before-quit 再走窗口 close，用该标记区分退出流程与用户关窗 */
  private quitting = false
  private lastRestartDay = ''
  private unsubscribers: Array<() => void> = []
  private attached = false

  constructor(
    private readonly events: EventBus,
    private readonly logger: Logger,
  ) {}

  async start(): Promise<void> {}

  /** 内核生命周期收口：清定时器、退订阅、复位 attach 标记 */
  async stop(): Promise<void> {
    this.dispose()
  }

  /**
   * 主窗口创建后调用一次：崩溃重载与退出拦截都挂主窗，开机自启与定时重启挂 app。
   * 幂等：重复 attach 以首次为准（窗口重建场景由 dispose + attach 重新走一遍）。
   */
  attach(
    policy: ResiliencePolicy,
    getWindow: () => BrowserWindow | undefined,
    deps?: ResilienceRestartDeps,
  ): void {
    if (this.attached) { return }
    this.attached = true
    if (policy.crashReload) { this.attachCrashReload(getWindow) }
    if (policy.autoLaunch !== undefined) { this.attachAutoLaunch(policy.autoLaunch) }
    if (policy.exitGuard) { this.attachExitGuard(getWindow) }
    if (policy.scheduledRestart) { this.attachScheduledRestart(policy.scheduledRestart, deps) }
  }

  dispose(): void {
    this.attached = false
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer)
      this.reloadTimer = null
    }
    if (this.restartTimer) {
      clearInterval(this.restartTimer)
      this.restartTimer = null
    }
    for (const unsubscribe of this.unsubscribers) { unsubscribe() }
    this.unsubscribers = []
  }

  /** 崩溃重载：指数退避，60s 滑动窗口内超过熔断次数即告警停载 */
  private attachCrashReload(getWindow: () => BrowserWindow | undefined): void {
    const win = getWindow()
    if (!win) { return }
    win.webContents.on('render-process-gone', (_event, details) => {
      if (details.reason === 'clean-exit') { return }
      this.events.emit('crash.renderer-gone', { windowId: win.id, reason: details.reason, restartCount: this.crashTimes.length })

      const now = Date.now()
      this.crashTimes = this.crashTimes.filter(time => now - time < CRASH_WINDOW_MS)
      this.crashTimes.push(now)
      if (isCircuitOpen(this.crashTimes.length)) {
        this.logger.error('crash circuit breaker opened, stop reloading', { reason: details.reason })
        return
      }
      const delay = nextCrashDelay(this.crashTimes.length)
      this.logger.warn(`renderer crashed (${details.reason}), reloading in ${String(delay)}ms`)
      this.reloadTimer = setTimeout(() => {
        this.reloadTimer = null
        if (!win.isDestroyed()) { win.webContents.reload() }
      }, delay)
    })
  }

  /**
   * 开机自启：配置即意图——flavor 声明 true 且打包态才注册登录项；
   * 显式 false 无条件移除（清理历史注册），dev 一律跳过。
   */
  private attachAutoLaunch(enabled: boolean): void {
    if (!enabled) {
      app.setLoginItemSettings({ openAtLogin: false })
      this.logger.info('autoLaunch removed')
      return
    }
    if (!app.isPackaged) {
      this.logger.debug('autoLaunch skipped (not packaged)')
      return
    }
    app.setLoginItemSettings({ openAtLogin: true })
    this.logger.info('autoLaunch enabled')
  }

  /** 用户发起的 close 全部拦截；app.quit() 的退出流程放行 */
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

  /** 分钟级轮询匹配时刻，同一天只触发一次 */
  private attachScheduledRestart(
    schedule: { hour?: number, minute?: number },
    deps?: ResilienceRestartDeps,
  ): void {
    const hour = schedule.hour ?? 3
    const minute = schedule.minute ?? 0
    this.restartTimer = setInterval(() => {
      const now = new Date()
      if (now.getHours() !== hour || now.getMinutes() !== minute) { return }
      const day = now.toDateString()
      if (day === this.lastRestartDay) { return }
      this.lastRestartDay = day
      void this.performScheduledRestart(deps, hour, minute)
    }, RESTART_POLL_MS)
  }

  /** 择优决策见 resolveRestartAction；执行层面整包走 quit（安装器接管），其余 relaunch+quit */
  private async performScheduledRestart(
    deps: ResilienceRestartDeps | undefined,
    hour: number,
    minute: number,
  ): Promise<void> {
    const action = resolveRestartAction(() => deps?.hasStagedPackage() ?? false)
    if (action === 'install-package') {
      this.logger.info('scheduled restart: quitting to run staged package installer')
      app.quit()
      return
    }
    this.logger.info(`scheduled daily restart at ${String(hour)}:${String(minute).padStart(2, '0')}`)
    app.relaunch()
    app.quit()
  }
}
