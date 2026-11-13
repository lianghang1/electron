import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

/**
 * 热更指针：文件名与引导层 apps/shell/electron/launcher/marks.mjs 是跨版本契约，
 * 改动必须两侧同步，并由 scripts/e2e/launcher-e2e.mjs 双向校验。
 */
export const UPDATER_DIR_NAME = 'updater'
export const MARK_FILES = {
  pending: 'pending.json',
  current: 'current.json',
  firstRun: 'first-run.json',
  gracefulExit: 'graceful-exit.json',
  appsCurrent: 'apps-current.json',
} as const

export interface CurrentMark {
  version: string
  file: string
  appliedAt: number
}

export interface PendingMark {
  version: string
  file: string
  sha256: string
}

/** 应用 dist 指针：appId → 生效的版本化目录 */
export interface AppPointerEntry {
  version: string
  dir: string
}

export function updaterDir(): string {
  return join(app.getPath('userData'), UPDATER_DIR_NAME)
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as T
  }
  catch {
    return null
  }
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(value))
}

export function readCurrent(): CurrentMark | null {
  return readJson<CurrentMark>(join(updaterDir(), MARK_FILES.current))
}

/** 生效业务版本：薄壳的 app.getVersion() 恒为出厂版本，版本语义一律从指针取 */
export function effectiveVersion(fallback: string): string {
  return readCurrent()?.version ?? fallback
}

export function writePending(mark: PendingMark): void {
  writeJson(join(updaterDir(), MARK_FILES.pending), mark)
}

export function readPending(): PendingMark | null {
  return readJson<PendingMark>(join(updaterDir(), MARK_FILES.pending))
}

export function hasPending(): boolean {
  const pending = readPending()
  return Boolean(pending?.file) && existsSync(join(updaterDir(), pending!.file))
}

/**
 * 主动重启标记：resilience relaunch 与整包退出都经 before-quit 写入，
 * 引导层据此不把同版本内的韧性重启判成坏版本回滚。
 */
export function markGracefulExit(): void {
  writeJson(join(updaterDir(), MARK_FILES.gracefulExit), { at: Date.now() })
}

export function readAppsPointer(): Record<string, AppPointerEntry> {
  return readJson<Record<string, AppPointerEntry>>(join(updaterDir(), MARK_FILES.appsCurrent)) ?? {}
}

export function writeAppsPointer(pointer: Record<string, AppPointerEntry>): void {
  writeJson(join(updaterDir(), MARK_FILES.appsCurrent), pointer)
}

/** 应用 dist 热更目录：版本化终名，下载即终名，永不 rename（规避文件锁与签名 seal） */
export function hotAppsDir(): string {
  return join(updaterDir(), 'apps')
}

/** 孤儿热更包清理：只删非生效、非待生效的 core-*.asar */
export function clearOrphanCores(keep: string[]): void {
  const dir = updaterDir()
  if (!existsSync(dir)) { return }
  for (const name of readdirSync(dir)) {
    if (!name.startsWith('core-') || !name.endsWith('.asar') || keep.includes(name)) { continue }
    try { rmSync(join(dir, name), { force: true }) }
    catch { /* 清理失败不阻塞热更链路 */ }
  }
}
