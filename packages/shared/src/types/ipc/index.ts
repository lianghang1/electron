import type { DomainIpc } from '../../domain'
import { appDomain } from './app'
import { cacheDomain } from './cache'
import { captureDomain, deviceDomain, printDomain, scannerDomain } from './devices'
import { downloadDomain } from './download'
import { notificationDomain } from './notification'
import { overlayDomain } from './overlay'
import { permissionDomain } from './permission'
import { storageDomain } from './storage'
import { tabsDomain } from './tabs'
import { updateDomain } from './update'
import { windowDomain } from './window'

/**
 * 平台 IPC 契约：Main / Preload / Renderer 三端共享的唯一类型来源。
 * 按能力域拆分在本目录，域文件与 core/src/ipc/ 的注册实现同名对应；
 * 域文件用 defineDomain 定义签名，通道名 / API 分组 / 运行时表全部自动推导。
 * 新增能力 = 新建域契约文件 + 下方并集与 platformDomains 各加一行。
 *
 * 契约形态（defineDomain 签名形态）：
 * - `invoke<(...args) => result>` → invoke / handle，请求-响应
 * - `push<[...args]>`            → event，Main 主动推送给 Renderer
 *
 * 安全约定：Main 侧一律根据 event.sender 反查 CallerContext，
 * 契约参数里永远不出现 appId / instanceId / tabId（防 Renderer 伪造身份）。
 */
export type DesktopIpc
  = & DomainIpc<typeof windowDomain>
    & DomainIpc<typeof appDomain>
    & DomainIpc<typeof tabsDomain>
    & DomainIpc<typeof permissionDomain>
    & DomainIpc<typeof storageDomain>
    & DomainIpc<typeof updateDomain>
    & DomainIpc<typeof downloadDomain>
    & DomainIpc<typeof cacheDomain>
    & DomainIpc<typeof deviceDomain>
    & DomainIpc<typeof scannerDomain>
    & DomainIpc<typeof captureDomain>
    & DomainIpc<typeof printDomain>
    & DomainIpc<typeof overlayDomain>
    & DomainIpc<typeof notificationDomain>

/** 平台域运行时注册表：preload 桥方法与 $invoke 白名单的唯一来源 */
export const platformDomains = [
  windowDomain,
  appDomain,
  tabsDomain,
  permissionDomain,
  storageDomain,
  cacheDomain,
  updateDomain,
  downloadDomain,
  deviceDomain,
  scannerDomain,
  captureDomain,
  printDomain,
  overlayDomain,
  notificationDomain,
] as const

/** 域对象再导出：Main 侧实现（广播通道等）直接取用 */
export { captureDomain, deviceDomain, printDomain, scannerDomain } from './devices'

/** 契约中 invoke 形态的 channel 子集：Main 侧 handle 包装 / Preload invoke 只看这里 */
export type DesktopInvoke = {
  [
  K in keyof DesktopIpc as DesktopIpc[K] extends (...args: never[]) => unknown ? K : never
  ]: DesktopIpc[K]
}
