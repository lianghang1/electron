import type { IpcDefs, IpcDomainValue } from '../contract'
import { defineIpcDomain, invoke } from '../contract'

/**
 * 更新状态域契约：查询 / 取消 / 安装（渲染层不再只能被动收事件）。
 * install 仅工作台可调用（主进程按 SHELL_APP_ID 闸门拒绝其他调用方）。
 */
export const updateDomain = defineIpcDomain('update', {
  state: invoke<() => any>(),
  cancel: invoke<() => void>(),
  install: invoke<() => void>(),
}) satisfies IpcDomainValue<'update', IpcDefs>
