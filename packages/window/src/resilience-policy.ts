/**
 * 韧性纯策略：择优决策、退避数学、熔断判定。零 electron 依赖，可被 e2e 直接验证。
 */

/**
 * 崩溃熔断：60s 滑动窗口内崩溃超过该次数停止重载，防崩溃死循环
 */
export const CRASH_WINDOW_MS = 60_000
export const MAX_CRASHES = 5
/** 崩溃重载指数退避：1s 起步，上限 30s */
export const BASE_DELAY_MS = 1_000
export const MAX_DELAY_MS = 30_000
/** 定时重启轮询间隔：分钟级匹配，容忍休眠唤醒与时钟小幅漂移 */
export const RESTART_POLL_MS = 60_000

/**
 * 运行韧性策略（flavor 声明，未声明的项全部关闭）：
 * - crashReload：渲染进程崩溃自动重载，指数退避 + 滑动窗口熔断（desktop 形态；
 *   kiosk 自带 relaunch 看门狗，两者互斥）
 * - autoLaunch：开机自启，仅打包态生效（dev 的登录项指向 electron.exe 无意义）
 * - exitGuard：拦截用户发起的窗口关闭（Alt+F4 等），app.quit() 退出流程放行
 * - scheduledRestart：每日定时重启，动作按更新状态择优
 */
export interface ResiliencePolicy {
  crashReload?: boolean
  autoLaunch?: boolean
  exitGuard?: boolean
  scheduledRestart?: { hour?: number, minute?: number }
}

/**
 * 定时重启的更新择优依赖（组合根闭包注入，规避服务创建顺序）：
 * - hasStagedPackage：整包已暂存，quit 让 before-quit 安装器接管退出
 * - hasPendingAsar：asar 热更已下载校验，重启经 finalize 就位
 */
export interface ResilienceRestartDeps {
  hasStagedPackage: () => boolean
  hasPendingAsar: () => boolean
}

/** 定时重启动作：整包安装（quit 让安装器接管）> 重启（asar 就位 / 释放内存） */
export type RestartAction = 'install-package' | 'relaunch'

/** 择优决策（纯函数）：探测失败按纯重启处理，不阻塞重启本身 */
export function resolveRestartAction(hasStagedPackage: () => boolean): RestartAction {
  try {
    return hasStagedPackage() ? 'install-package' : 'relaunch'
  }
  catch {
    return 'relaunch'
  }
}

/** 崩溃重载指数退避：第 n 次崩溃延迟 1s * 2^(n-1)，上限 30s */
export function nextCrashDelay(crashCount: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** (crashCount - 1), MAX_DELAY_MS)
}

/** 崩溃熔断：60s 滑动窗口内超过 MAX_CRASHES 次停止重载 */
export function isCircuitOpen(crashCount: number): boolean {
  return crashCount > MAX_CRASHES
}
