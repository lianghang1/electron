import type { Logger } from '@shell/kernel/logger'
import type { AppManifest } from '@shell/shared'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { appManifestSchema } from '@shell/shared'

export interface AppsJsonOptions {
  /** 已被占用的 id（内置清单）；同 id 的本地项跳过，避免注册表与策略表出现双份 */
  excludeIds?: readonly string[]
}

/**
 * 本地扩展应用源：<配置目录>/apps.json——现场免重打包加应用。
 * 与 flavor 内置清单同构（appManifestSchema 全量校验）：无效项跳过并告警，
 * 文件缺失/畸形返回空表；同 id 只保留首个，其余视为无效。
 */
export function loadAppsJson(dir: string, logger: Logger, options: AppsJsonOptions = {}): AppManifest[] {
  const file = join(dir, 'apps.json')
  if (!existsSync(file)) { return [] }

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf-8'))
  }
  catch (err) {
    logger.warn('apps.json 解析失败，忽略本地扩展应用', { error: String(err) })
    return []
  }
  if (!Array.isArray(raw)) {
    logger.warn('apps.json 顶层须为数组，忽略本地扩展应用')
    return []
  }

  const excluded = new Set(options.excludeIds ?? [])
  const manifests: AppManifest[] = []
  const seen = new Set<string>()
  let skipped = 0
  for (const item of raw) {
    const parsed = appManifestSchema.safeParse(item)
    if (!parsed.success) {
      skipped++
      continue
    }
    if (seen.has(parsed.data.id) || excluded.has(parsed.data.id)) {
      skipped++
      continue
    }
    seen.add(parsed.data.id)
    manifests.push(parsed.data)
  }
  if (skipped > 0) { logger.warn(`apps.json 跳过 ${String(skipped)} 个无效、重复或占用 id 的清单`) }
  return manifests
}
