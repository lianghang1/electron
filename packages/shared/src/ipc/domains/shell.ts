import type { IpcDefs, IpcDomainValue } from '../contract'
import { defineIpcDomain, invoke, push } from '../contract'

/** 设备状态行（DeviceStatus 投影：契约不反向依赖 devices 包，按结构化克隆面声明） */
export interface DeviceStatusRow {
  capabilityId: string
  state: string
  reasonCode?: string
  [key: string]: unknown
}

/** 壳信息快照：chrome 档位不经此下发（经 additionalArguments 同步送达，首帧即定型） */
export interface ShellInfo {
  name: string
  version: string
  defaultAppId?: string
  mode: 'windowed' | 'kiosk'
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
  /** 守护进程预热是否完成：未完成时设备相关入口显示「设备初始化中」过渡态（可经 devices.ready 事件解除） */
  deviceHostReady: boolean
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
  /**
   * 启动过场起点：主进程在首帧已绘制（ready-to-show）时推送一次。
   * 渲染层收到才开始播启动 logo 动画——窗口是否真正上屏只有主进程知道，
   * 渲染层的 visibilityState 不可作为依据（禁用 Win 遮罩计算后隐藏窗恒为 visible，
   * 过场会被隐藏期整段吞掉，上屏即应用界面）。
   */
  introBegin: push<[]>(),
}) satisfies IpcDomainValue<'shell', IpcDefs>
