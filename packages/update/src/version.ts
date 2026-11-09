import type { AppPointerEntry } from './boot/pointer'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** 读取 appsRoot/<appId>/version.json：内置应用版本 */
export function collectAppVersions(appsRoot: string): Record<string, string> {
  const versions: Record<string, string> = {}
  if (!existsSync(appsRoot)) { return versions }
  for (const entry of readdirSync(appsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) { continue }
    versions[entry.name] = readVersion(join(appsRoot, entry.name)) ?? ''
    if (!versions[entry.name]) { delete versions[entry.name] }
  }
  return versions
}

/**
 * 生效应用版本：热更指针优先于内置目录。指针目录丢失时回退内置版本，
 * 避免 userData 被清理后版本矩阵空转导致重复下载。
 */
export function collectEffectiveAppVersions(
  appsRoot: string,
  pointer: Record<string, AppPointerEntry>,
): Record<string, string> {
  const versions = collectAppVersions(appsRoot)
  for (const [appId, entry] of Object.entries(pointer)) {
    if (existsSync(entry.dir)) { versions[appId] = entry.version }
  }
  return versions
}

function readVersion(dir: string): string | undefined {
  const file = join(dir, 'version.json')
  if (!existsSync(file)) { return undefined }
  try {
    return (JSON.parse(readFileSync(file, 'utf-8')) as { version?: string }).version
  }
  catch {
    return undefined
  }
}
