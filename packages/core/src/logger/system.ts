import type { CallerResolver } from '../ipc/caller-context'
import type { Logger } from './logger'
import { app } from 'electron'
import log from 'electron-log/main'

/**
 * 系统级日志接入（Main 进程全局事件，Application 组装时挂载一次）：
 * - 未捕获异常 / 未处理 Promise 拒绝（electron-log errorHandler，不弹系统对话框）
 * - 子进程异常退出（GPU / utility / renderer 宿主）
 * - 渲染进程崩溃：按 CallerResolver 反查 App 身份，统一覆盖 Shell 窗口与全部 Web 容器
 * - renderer 控制台输出：console-message 桥接进日志（Electron ≥32 为单参数 event 对象）
 */
export function attachSystemLogging(logger: Logger, resolver: CallerResolver): void {
  const system = logger.scope('system')

  // 1. 主进程未捕获异常 / Promise 拒绝
  log.errorHandler.startCatching({ showDialog: false })

  // 2. 子进程（GPU / utility 等）异常退出
  app.on('child-process-gone', (_event, details) => {
    system.error(`child process gone: ${details.type}`, {
      reason: details.reason,
      exitCode: details.exitCode,
      service: details.serviceName,
    })
  })

  // 3. 渲染进程崩溃（Web 容器不再单独挂，统一在此记录）
  app.on('render-process-gone', (_event, contents, details) => {
    const appId = resolver.tryResolve(contents)?.appId ?? 'unknown'
    system.error(`render process gone: ${appId}`, {
      reason: details.reason,
      exitCode: details.exitCode,
    })
  })

  // 4. renderer 控制台 → 日志（Shell 与 Web App 全部捕获，含来源文件定位）
  app.on('web-contents-created', (_event, contents) => {
    contents.on('console-message', (event) => {
      const appId = resolver.tryResolve(contents)?.appId
      const scoped = logger.scope(appId ? `renderer:${appId}` : 'renderer:unknown')
      const level = event.level === 'warning' ? 'warn' : event.level ?? 'info'
      const where = event.sourceId ? ` (${event.sourceId}:${event.lineNumber ?? 0})` : ''
      scoped[level](`${event.message}${where}`)
    })
  })
}
