import type { AppManifest } from '@shell/shared'
import type { PermissionRule } from './permission-service'
import { SHELL_APP_ID } from '@shell/shared'

const allow = (app: string, permission: string): PermissionRule => ({ app, permission, verdict: 'allow' })

/**
 * 注册清单 → 权限策略表：清单声明即放行，未声明一律拒绝。
 * 同 id 只取首个（内置优先），规则与注册表一一对应。
 */
export function buildAppPermissionRules(manifests: readonly AppManifest[]): PermissionRule[] {
  const seen = new Set<string>()
  const rules: PermissionRule[] = []
  for (const manifest of manifests) {
    if (seen.has(manifest.id)) { continue }
    seen.add(manifest.id)
    rules.push(allow(manifest.id, 'app.open'))
    for (const device of manifest.devices) { rules.push(allow(manifest.id, `domain.${device}`)) }
    for (const permission of manifest.permissions) { rules.push(allow(manifest.id, permission)) }
  }
  return rules
}

/**
 * 平台自身（shell 主窗与 embedded 融合页）的规则：只放行能力矩阵内已启用的设备域。
 * 自检台/设置页等融合页没有独立 webContents，身份恒为 shell；它们的硬件调用代表平台本身，
 * 与第三方应用按声明隔离的口径不同，故单独成表，不与 apps.json 混用。
 */
export function buildPlatformPermissionRules(availableDomains: readonly string[]): PermissionRule[] {
  return [
    allow(SHELL_APP_ID, 'app.open'),
    ...availableDomains.map(domain => allow(SHELL_APP_ID, `domain.${domain}`)),
  ]
}
