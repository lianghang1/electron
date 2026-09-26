import type { HospitalBusinessConfig } from '../../../src/types/hospital'
import type { HospitalIpc } from '../../../src/types/ipc'
import { createHandle } from '@desktop/core'

/** 业务通道包装：channel / 入参 / 返回值全部受 HospitalIpc 契约约束 */
const handle = createHandle<HospitalIpc>()

export function registerHospitalBusiness(businessConfig: HospitalBusinessConfig): void {
  handle('hospital:config:get', () => businessConfig)
}
