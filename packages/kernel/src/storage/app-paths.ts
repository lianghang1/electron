import { join } from 'node:path'
import { app } from 'electron'

/**
 * 平台自管数据统一根目录：所有平台代码产生的文件（配置 / 日志 / Cookie 快照 / 业务文件）
 * 收敛到 userData/platform/ 之下按职责分目录，与 userData 层的 Chromium 引擎自管内容
 * （Partitions / Cache / Crashpad 等，无重定向接口）隔离。
 *
 * 唯一例外：userData/desktop-updater/（asar 热更工作目录）保持原位——它是主进程与引导器
 * （launcher，只随整包更新落地、自身永不热更）的跨版本契约目录，改名会使已部署环境的旧
 * 引导器失去 pending/current 指针，热更链路断裂。
 */

/** 统一根目录名（相对 userData） */
const ROOT_DIR = 'platform'

/** 平台自管数据根目录（userData/platform/） */
export function platformDataRoot(): string {
  return join(app.getPath('userData'), ROOT_DIR)
}

/** 配置目录：electron-store 全部文件 / apps.json / 打印任务簿 */
export function configDir(): string {
  return join(platformDataRoot(), 'storage')
}

/** 日志根目录：运行日志（main-*.log）与审计日志（logs/audit/） */
export function logsDir(): string {
  return join(platformDataRoot(), 'logs')
}

/** Cookie 快照目录：app-<appId>-cookies.json */
export function cookiesDir(): string {
  return join(platformDataRoot(), 'cookies')
}

/** 业务产物文件根目录：capture / print / signature 按域分目录 */
export function filesDir(): string {
  return join(platformDataRoot(), 'files')
}
