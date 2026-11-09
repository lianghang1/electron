import { isNewer } from './security'

/**
 * 强制更新判定（纯函数）：清单声明最低可用版本，当前版本低于它即阻断使用。
 * 未声明或版本达标 → 放行；判定输入畸形时 fail-open（放行），阻断决策只由可信清单驱动。
 */
export interface ForceUpdateDecision {
  blocked: boolean
  /** 被阻断时要求的最低版本 */
  requiredVersion?: string
}

export function resolveForceUpdate(currentVersion: string, minVersion: string | undefined): ForceUpdateDecision {
  const required = minVersion?.trim()
  if (!required) { return { blocked: false } }
  if (!isNewer(required, currentVersion)) { return { blocked: false } }
  return { blocked: true, requiredVersion: required }
}
