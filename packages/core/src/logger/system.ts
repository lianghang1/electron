import type { EventBus } from '../event/event-bus'
import type { CallerResolver } from '../ipc/caller-context'
import type { Logger } from './logger'
import { app } from 'electron'
import log from 'electron-log/main'

/**
 * 系统级日志接入（Main 进程全局事件，Application 组装时挂载一次）：
 * - 未捕获异常 / 未处理 Promise 拒绝（electron-log errorHandler，不弹系统对话框）
 * - 子进程异常退出（GPU / utility / renderer 宿主）
 * - 渲染进程崩溃：按 CallerResolver 反查 App 身份，统一覆盖 Shell 窗口与全部 Web 容器，
 *   并上抛 renderer:crashed 事件（审计留痕 / 韧性联动）
 * 注意：网页 console 不桥接进日志——App 网页内部的报错归其自身 DevTools / 前端监控，
 * 平台日志只记平台视角的事件（崩溃、异常退出等），避免第三方网页噪音刷爆日志文件
 */
export function attachSystemLogging(logger: Logger, resolver: CallerResolver, events: EventBus): void {
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
    events.emit('renderer:crashed', { appId, reason: details.reason })
  })
}
