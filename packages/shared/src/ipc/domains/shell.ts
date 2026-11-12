import type { IpcDefs, IpcDomainValue } from '../contract'
import { defineIpcDomain, invoke } from '../contract'

/** 设备状态行（DeviceStatus 投影：契约不反向依赖 devices 包，按结构化克隆面声明） */
export interface DeviceStatusRow {
  capabilityId: string
  state: string
  reasonCode?: string
  [key: string]: unknown
}

/** 壳信息快照：渲染层按 chrome 档位决定挂不挂壳界面 */
export interface ShellInfo {
  name: string
  version: string
  defaultAppId?: string
  chrome: 'platform' | 'solo'
  mode: 'desktop' | 'kiosk'
  /** 强制更新门禁快照（清单 minVersion 与当前版本比对的结果） */
  forceUpdate?: { blocked: boolean, requiredVersion?: string }
  capabilities: {
    platform: string
    availableDomains: string[]
    driverDeployment: string
    notes?: string
  }
  /** 各能力设备状态（state + 原因码；渲染层投影为自有视图类型，故保留宽松面） */
  deviceStatus: any[]
  /** 设备运行观测快照（结构随观测面板演化，渲染层按字段消费） */
  deviceTelemetry: any
}

/** 更新状态（UpdateCenter.getState 投影，status 承载状态机全量取值） */
export interface UpdateStateProjection {
  status: 'idle' | 'checking' | 'downloading' | 'applying' | 'pending-restart' | 'failed' | 'cancelled'
  [key: string]: unknown
}

/**
 * 壳自身域契约：信息 / 重启 / 立即更新。appearance 不走 IPC——由组合根经
 * additionalArguments 同步送达（preload 同步读取），避免异步首帧闪烁。
 */
export const shellDomain = defineIpcDomain('shell', {
  info: invoke<() => ShellInfo>(),
  /** 重启壳：先 relaunch 再 quit，before-quit 钩子会执行暂存的整包安装 */
  relaunch: invoke<() => void>(),
  /** 立即巡检并应用更新（门禁页主动更新入口），结果经 update 事件回传 */
  updateNow: invoke<() => unknown>(),
}) satisfies IpcDomainValue<'shell', IpcDefs>
