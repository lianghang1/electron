import type { HospitalBusinessConfig } from './hospital'

/**
 * 医院业务通道契约（App 本地）：Main 侧 createHandle<HospitalIpc>() 注册，
 * preload 声明白名单，Renderer 侧经 window.desktop.$invoke 由 src/api/hospital.ts 收口类型。
 */
export interface HospitalIpc {
  'hospital:config:get': () => HospitalBusinessConfig
}
