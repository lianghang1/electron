import type { AppManifest } from '@shell/shared'
import type { PermissionRule } from './permission-service'

/**
 * 注册清单 → 权限策略表：清单声明即放行，未声明一律拒绝。
 * 同 id 只取首个（内置优先），规则与注册表一一对应。
 */
export function buildAppPermissionRules(manifests: readonly AppManifest[]): PermissionRule[] {
  const seen = new Set<string>()
  const rules: PermissionRule[] = []
  const allow = (app: string, permission: string): PermissionRule => ({ app, permission, verdict: 'allow' })
  for (const manifest of manifests) {
    if (seen.has(manifest.id)) { continue }
    seen.add(manifest.id)
    rules.push(allow(manifest.id, 'app.open'))
    for (const device of manifest.devices) { rules.push(allow(manifest.id, `domain.${device}`)) }
    for (const permission of manifest.permissions) { rules.push(allow(manifest.id, permission)) }
  }
  return rules
}
