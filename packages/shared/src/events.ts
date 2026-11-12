import type { DownloadTask } from './download'

/**
 * 平台事件名（过去式，结果导向）。
 * 事件总线是类型化的：emit/on 的事件名必须是本表的 key。
 */
export interface PlatformEvents {
  // 应用生命周期
  'app.opening': { appId: string, instanceId: string }
  'app.opened': { appId: string, instanceId: string }
  'app.closed': { appId: string, instanceId: string, reason: 'user' | 'crash' | 'update' }
  // 设备守护进程
  'device-host.started': { pid: number }
  'device-host.exited': { pid: number, code: number, restartCount: number }
  // 更新
  'update.checked': { channel: string, available: boolean }
  'update.applied': { channel: string, version: string }
  'update.failed': { channel: string, reason: string }
  'update.restart-required': { channel: string, version: string }
  /** 更新状态快照：渲染层查询进度与取消按钮的推送源 */
  'update.state-changed': {
    status: 'idle' | 'checking' | 'downloading' | 'applying' | 'pending-restart' | 'failed' | 'cancelled'
    channel?: string
    version?: string
    error?: string
    checkedAt?: number
  }
  /** 门禁从放行转为阻断时发一次；渲染层据此切换门禁页 */
  'update.force-required': { requiredVersion: string }
  // 窗口
  'window.created': { profile: string, id: number }
  'window.closed': { id: number }
  // 设备数据流（gateway 接入层把回调转为广播）
  // 守护进程预热完成：设备相关入口据此从「初始化中」过渡态切换为可交互
  'devices.ready': Record<string, never>
  'scanner.scanned': { code: string }
  'signature.stroke': { point: unknown }
  'capture.frame': { deviceId: string, frame: unknown }
  // 设备运行时观测：域调用打点与汇总快照推给诊断台
  'devices.call-recorded': {
    capabilityId: string
    methodName: string
    appId: string
    ok: boolean
    durationMs: number
    at: number
    errorCode?: string
  }
  'devices.telemetry-changed': {
    calls: number
    failures: number
    totalDurationMs: number
    byCapability: Record<string, {
      calls: number
      failures: number
      totalDurationMs: number
      lastErrorCode?: string
    }>
  }
  // 崩溃与自愈
  'crash.renderer-gone': { windowId: number, reason: string, restartCount: number }
  'watchdog.recovery-mode': { reason: string }
  // 权限决策：审计落盘与运行日志共用同一事实源
  'permission.decided': {
    appId: string
    permission: string
    verdict: 'allow' | 'deny'
    source: 'policy' | 'store' | 'prompt' | 'default'
  }
  // 下载：tasks-changed 推全量快照给横幅，终态事件供审计留痕
  'download.tasks-changed': { tasks: DownloadTask[] }
  'download.completed': { taskId: string, appId: string, filename: string }
  'download.cancelled': { taskId: string, appId: string, reason: 'user' | 'policy' | 'interrupted' }
  'download.failed': { taskId: string, appId: string, reason: string }
  // 会话容器
  'session.cleared': { appId: string, scope: 'cache' | 'site-data' }
  'session.cookies-restored': { appId: string, count: number }
  // 统一消息通道：toast / 下载卡 / 通知中心共用一份快照
  'notification.updated': {
    items: {
      id: string
      title: string
      body?: string
      level: 'info' | 'success' | 'warning' | 'error'
      createdAt: number
      ttlMs: number
    }[]
  }
  // 过期产物清理报告
  'retention.cleaned': { reports: { producer: string, removed: number, bytes: number }[] }
  // 原生浮层宿主
  'overlay.opened': { kind: string }
  'overlay.closed': { kind: string }
  // 运行时授权：弹窗入列与决策完成
  'permission.pending': { requestId: string, appId: string, permission: string, origin: string }
  'permission.resolved': { requestId: string, granted: boolean }
  // Tab 细粒度状态
  'tabs.state-changed': { instanceId: string, action: 'reload' | 'fullscreen' | 'work-area' }
}

export type PlatformEventName = keyof PlatformEvents
