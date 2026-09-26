/**
 * 医院自助终端（apps/hospital）业务类型：App 本地，不进平台包（@desktop/shared）。
 */

/** 自助机业务配置：部署时按机器写 userData/config.json 覆盖默认值 */
export interface HospitalBusinessConfig {
  /** 机器编号（运维定位 / 监控大盘标识） */
  machineId: string
  /** 部署科室/楼层（导诊默认文案） */
  department: string
  /** 院内服务器地址（热更 feed / 监控上报，未配置用构建内置默认） */
  serverUrl?: string
}
