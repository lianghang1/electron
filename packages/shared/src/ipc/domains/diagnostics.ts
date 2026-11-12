import type { IpcDefs, IpcDomainValue } from '../contract'
import { defineIpcDomain, invoke } from '../contract'

/**
 * 验机文件选择域契约：用户在原生对话框显式选中后只回传绝对路径，取消返回 null。
 * 扩展名白名单由主进程固定，渲染层传入的 kind 仅决定过滤器，不参与放行判定。
 */
export const diagnosticsDomain = defineIpcDomain('diagnostics', {
  pickFile: invoke<(kind?: 'image' | 'pdf' | 'any') => string | null>(),
}) satisfies IpcDomainValue<'diagnostics', IpcDefs>
