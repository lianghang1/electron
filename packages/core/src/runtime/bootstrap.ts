import type { BootstrapOptions } from '../types'
import { crashReporter } from 'electron'
import { DesktopRuntime } from './desktop-runtime'

/**
 * 崩溃防护第 0 层：主进程启动最早期接入 CrashReporter。
 * 必须在 app ready 前调用；minidump 仅本地落盘（crashDumps 标准目录）不上报，
 * 渲染/GPU/工具进程的硬崩溃（设备驱动踩内存等）在此留下现场供排障。
 */
function startCrashReporter(): void {
  try {
    crashReporter.start({ uploadToServer: false, compress: true })
  }
  catch (error) {
    // 启动最早期 logger 尚未创建，失败留痕到 stdout，不阻塞应用启动
    console.error('[bootstrap] crashReporter start failed:', error)
  }
}

/**
 * 应用启动入口：装配平台 Service → 注册 IPC → 创建窗口 → 管理生命周期。
 * app 的 electron/main/index.ts 只需要调用它并传入 DesktopConfig + 差异项。
 */
export function bootstrap(options: BootstrapOptions): void {
  assertEntryAppsExclusive(options)
  startCrashReporter()
  new DesktopRuntime(options).start()
}

/** 内容承载形态互斥：单站直嵌（entry）与多 App 平台（apps）二选一，防止两种形态混配出歧义配置 */
function assertEntryAppsExclusive(options: BootstrapOptions): void {
  const hasApps = Boolean(options.apps?.manifests?.length || options.apps?.remoteUrl)
  if (options.entry && hasApps) {
    throw new Error('[bootstrap] entry 与 apps 互斥：单站直嵌形态用 entry，多 App 形态用 apps.manifests')
  }
}
