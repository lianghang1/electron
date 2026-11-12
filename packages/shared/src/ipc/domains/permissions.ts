import type { IpcDefs, IpcDomainValue } from '../contract'
import { defineIpcDomain, invoke } from '../contract'

/** 授权结论（PermissionService 三态，与运行时授权弹窗结论同源） */
export type PermissionVerdict = 'allow' | 'deny' | 'prompt'

/**
 * 运行时权限域契约：应用主动查询 / 请求 / 重置。
 * query 只做展示不弹窗；request 打开原生浮层询问，结论持久化后不再反复打扰；
 * reset 是工作台的管理动作（主进程按 SHELL_APP_ID 闸门拒绝其他调用方）。
 */
export const permissionsDomain = defineIpcDomain('permissions', {
  query: invoke<(permission: string) => PermissionVerdict>(),
  request: invoke<(permission: string) => boolean>(),
  list: invoke<(appId?: string) => any>(),
  reset: invoke<(permission: string) => void>(),
}) satisfies IpcDomainValue<'permissions', IpcDefs>
