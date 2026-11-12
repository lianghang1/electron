import type { IpcDefs, IpcDomainValue } from '../contract'
import { defineIpcDomain, invoke } from '../contract'

/**
 * 应用会话数据域契约：清缓存不影响登录态，清站点数据等于该应用登出。
 * appId 为管理面显式参数（与 CallerResolver 反查身份双保险），越权在主进程拒绝。
 */
export const sessionsDomain = defineIpcDomain('sessions', {
  clearCache: invoke<(appId: string) => void>(),
  clearSiteData: invoke<(appId: string) => void>(),
}) satisfies IpcDomainValue<'sessions', IpcDefs>
