import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** 读取 appsRoot/<appId>/version.json：dist-hot 原子换目录后版本随之刷新，避免重复更新。 */
export function collectAppVersions(appsRoot: string): Record<string, string> {
  const versions: Record<string, string> = {}
  if (!existsSync(appsRoot)) { return versions }
  for (const entry of readdirSync(appsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) { continue }
    const file = join(appsRoot, entry.name, 'version.json')
    if (!existsSync(file)) { continue }
    try {
      const { version } = JSON.parse(readFileSync(file, 'utf-8')) as { version?: string }
      if (version) { versions[entry.name] = version }
    }
    catch { continue }
  }
  return versions
}
