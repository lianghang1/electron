import type { DesktopAppManifest } from '@desktop/shared'
import type { Logger } from '../logger/logger'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** 最小结构校验：外部 JSON 不受 TS 约束，入口必须把好关 */
export function isAppManifest(value: unknown): value is DesktopAppManifest {
  if (typeof value !== 'object' || value === null)
    return false
  const v = value as Record<string, unknown>
  return typeof v.id === 'string'
    && typeof v.name === 'string'
    && typeof v.version === 'string'
    && typeof v.entry === 'object'
    && v.entry !== null
}

/**
 * 本地配置文件 App 源：<userData>/apps.json（DesktopAppManifest 数组）。
 * 平台的多源注册入口之一：代码注册内置 App，外部文件注册扩展 App，
 * 远程源（loadRemoteAppManifests）与本地源共用同一结构校验。
 */
export function loadLocalAppManifests(userDataPath: string, logger: Logger): DesktopAppManifest[] {
  const file = join(userDataPath, 'apps.json')
  if (!existsSync(file))
    return []

  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf-8'))
    if (!Array.isArray(parsed)) {
      logger.warn('apps.json is not an array, ignored')
      return []
    }
    const manifests = parsed.filter(isAppManifest)
    const invalid = parsed.length - manifests.length
    if (invalid > 0)
      logger.warn(`apps.json contains ${invalid} invalid manifest(s), skipped`)
    return manifests
  }
  catch (error) {
    logger.error('failed to load apps.json', { error: String(error) })
    return []
  }
}

/**
 * 远程配置源：HTTP(S) 拉取 DesktopAppManifest 数组（应用中心 / 企业应用商店）。
 * 超时与解析失败都不拖垮平台启动；结构校验与本地源同一标准。
 */
export async function loadRemoteAppManifests(url: string, logger: Logger): Promise<DesktopAppManifest[]> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) {
      logger.warn(`remote app source responded ${response.status}`, { url })
      return []
    }
    const parsed: unknown = await response.json()
    if (!Array.isArray(parsed)) {
      logger.warn('remote app source is not an array, ignored', { url })
      return []
    }
    const manifests = parsed.filter(isAppManifest)
    const invalid = parsed.length - manifests.length
    if (invalid > 0)
      logger.warn(`remote app source contains ${invalid} invalid manifest(s), skipped`, { url })
    return manifests
  }
  catch (error) {
    logger.error('failed to load remote app source', { url, error: String(error) })
    return []
  }
}
