import type { IpcContract, IpcDefs, IpcDomainValue, IpcPushContract, IpcSendContract, ShellDomainApi } from './contract'
import { appsDomain } from './domains/apps'
import { captureDialogDomain } from './domains/capture-dialog'
import { deviceConfigDomain } from './domains/device-config'
import { diagnosticsDomain } from './domains/diagnostics'
import { downloadsDomain } from './domains/downloads'
import { notificationsDomain } from './domains/notifications'
import { overlayDomain } from './domains/overlay'
import { permissionsDomain } from './domains/permissions'
import { sessionsDomain } from './domains/sessions'
import { settingsDomain } from './domains/settings'
import { shellDomain } from './domains/shell'
import { storageDomain } from './domains/storage'
import { systemDomain } from './domains/system'
import { tabsDomain } from './domains/tabs'
import { updateDomain } from './domains/update'
import { windowDomain } from './domains/window'

/**
 * 壳设施域运行时注册表：preload 桥方法生成的唯一来源（新增能力域 = 契约文件 + 此处一行）。
 * 设备域不走此表——它们经 zod 单通道 domain-call 路由（packages/devices 域 SPI）。
 */
export const shellDomains = [
  windowDomain,
  appsDomain,
  shellDomain,
  settingsDomain,
  deviceConfigDomain,
  diagnosticsDomain,
  downloadsDomain,
  sessionsDomain,
  storageDomain,
  notificationsDomain,
  updateDomain,
  permissionsDomain,
  tabsDomain,
  overlayDomain,
  captureDialogDomain,
  systemDomain,
] as const

type ShellDomainValue = (typeof shellDomains)[number]

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never

/** 分布式条件：对联合的每个域成员求值（naked 参数进条件类型才逐成员分发） */
type ShellIpcPart<V> = V extends IpcDomainValue<string, IpcDefs> ? IpcContract<V> : never
type ShellSendPart<V> = V extends IpcDomainValue<string, IpcDefs> ? IpcSendContract<V> : never
type ShellPushPart<V> = V extends IpcDomainValue<string, IpcDefs> ? IpcPushContract<V> : never

/** 主进程 shellHandle 注册键与签名（invoke） */
export type ShellIpc = UnionToIntersection<ShellIpcPart<ShellDomainValue>>

/** 主进程 shellOn 注册键与参数元组（send） */
export type ShellSendIpc = UnionToIntersection<ShellSendPart<ShellDomainValue>>

/** preload 订阅通道与回调参数表（push） */
export type ShellPushIpc = UnionToIntersection<ShellPushPart<ShellDomainValue>>

/** 非根域 → 分组 API；根域（system）方法提升到 window.desktop 根（外层条件保证逐成员分发） */
type DomainApiPart<V> = V extends ShellDomainValue
  ? V['root'] extends true ? ShellDomainApi<V>[V['domain']] : ShellDomainApi<V>
  : never

/** window.desktop 的壳设施桥面类型（preload 生成面 + 设备域两个特殊方法 + 同步外观快照） */
export type ShellBridge = UnionToIntersection<DomainApiPart<ShellDomainValue>> & {
  /** 设备域通用调用端：invoke('print.submitJob', input)（zod 校验 + 权限闸门在主进程路由层） */
  invoke: (method: string, input: unknown) => Promise<unknown>
  /** 平台事件订阅：kernel 事件名 → event:<name> 通道；scanner.scanned 兼容映射旧通道 */
  onEvent: (event: string, handler: (payload: unknown) => void) => () => void
} & {
  /** 同步快照：启动外观（组合根经 additionalArguments 送达，preload 读启动参数，不经 IPC） */
  shell: { appearance: () => { accent: string, theme: 'light' | 'dark' | 'system' } }
}

// 契约原语与异常规范化一并出桥：preload 生成面 / 主进程 shellHandle 同源引用
export type { InvokeSig, IpcContract, IpcDefs, IpcDomainValue, IpcPushContract, IpcSendContract, PushSig, SendArgsOf, SendSig, ShellDomainApi, SigOf } from './contract'
export { defineIpcDomain, invoke, push, send } from './contract'
// 契约内的 IPC 边界形状（window / renderer 跨包复用，避免重复定义）
export type { OverlayAction, OverlayKind } from './domains/overlay'
export type { IpcErrorPayload } from './errors'

export { decodeIpcError, encodeIpcError, IpcRemoteError } from './errors'
