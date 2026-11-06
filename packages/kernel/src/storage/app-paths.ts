import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
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

/**
 * 旧布局一次性迁移（启动最早处、任何首次写盘之前调用，幂等）：
 * 旧版散落在 userData 根目录的自管文件整体 rename 进统一根目录。仅"源存在且目标不存在"
 * 才执行，失败仅告警不阻断启动（各落盘点均以新目录为准，rename 失败仅发生于跨卷/文件
 * 占用等异常场景）。
 */
export function migrateLegacyLayout(): void {
  const userData = app.getPath('userData')

  moveDir(join(userData, 'storage'), configDir())
  moveDir(join(userData, 'logs'), logsDir())
  moveDir(join(userData, 'audit'), join(logsDir(), 'audit'))
  moveDir(join(userData, 'capture'), join(filesDir(), 'capture'))
  moveDir(join(userData, 'print-archive'), join(filesDir(), 'print'))
  // 历史命名收敛：print-archive → print（旧版已迁入统一根目录的机器补迁，幂等）
  moveDir(join(filesDir(), 'print-archive'), join(filesDir(), 'print'))
  moveFile(join(userData, 'apps.json'), join(configDir(), 'apps.json'))
  moveFile(join(userData, 'print-jobs.json'), join(configDir(), 'print-jobs.json'))
  moveCookiesSnapshots(userData)
}

/** 根目录散落的 app-<appId>-cookies.json 快照收敛到 cookies/ 目录 */
function moveCookiesSnapshots(userData: string): void {
  let names: string[]
  try {
    names = readdirSync(userData)
  }
  catch {
    return
  }
  for (const name of names) {
    if (name.startsWith('app-') && name.endsWith('-cookies.json')) {
      moveFile(join(userData, name), join(cookiesDir(), name))
    }
  }
}

/** 整目录迁移（源存在且目标不存在才 rename） */
function moveDir(from: string, to: string): void {
  if (!existsSync(from) || existsSync(to)) { return }
  try {
    mkdirSync(dirname(to), { recursive: true })
    renameSync(from, to)
  }
  catch (error) {
    console.warn(`[paths] legacy dir migrate failed: ${from} → ${to}`, error)
  }
}

/** 单文件迁移（源存在且目标不存在才 rename） */
function moveFile(from: string, to: string): void {
  if (!existsSync(from) || existsSync(to)) { return }
  try {
    mkdirSync(dirname(to), { recursive: true })
    renameSync(from, to)
  }
  catch (error) {
    console.warn(`[paths] legacy file migrate failed: ${from} → ${to}`, error)
  }
}
