import type { DomainDefinition } from '@shell/shared'
import type { DomainDeps } from '../../domain-kit'
import type { CaptureSystem } from './index'
import { defineDomain } from '@shell/shared'
import { createCaptureMethods } from './methods'

/** capture 域：高拍仪 / 摄像采集（预览帧经 EventBus 广播）。 */
export function createCaptureDomain(capture: CaptureSystem, deps: DomainDeps): DomainDefinition {
  return defineDomain('capture', createCaptureMethods(capture, deps))
}
