import type { DomainIpc } from '../../domain'
import { appDomain } from './app'
import { cacheDomain } from './cache'
import { captureDialogDomain, captureDomain, deviceDomain, printDomain, scannerDomain, signatureDomain } from './devices'
import { downloadDomain } from './download'
import { menuDomain } from './menu'
import { notificationDomain } from './notification'
import { overlayDomain } from './overlay'
import { permissionDomain } from './permission'
import { permissionDialogDomain } from './permission-dialog'
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
    & DomainIpc<typeof permissionDialogDomain>
    & DomainIpc<typeof storageDomain>
    & DomainIpc<typeof updateDomain>
    & DomainIpc<typeof downloadDomain>
    & DomainIpc<typeof cacheDomain>
    & DomainIpc<typeof menuDomain>
    & DomainIpc<typeof deviceDomain>
    & DomainIpc<typeof signatureDomain>
    & DomainIpc<typeof scannerDomain>
    & DomainIpc<typeof captureDomain>
    & DomainIpc<typeof captureDialogDomain>
    & DomainIpc<typeof printDomain>
    & DomainIpc<typeof overlayDomain>
    & DomainIpc<typeof notificationDomain>

/** 平台域运行时注册表：preload 桥方法与 $invoke 白名单的唯一来源 */
export const platformDomains = [
  windowDomain,
  appDomain,
  tabsDomain,
  permissionDomain,
  permissionDialogDomain,
  storageDomain,
  cacheDomain,
  updateDomain,
  downloadDomain,
  menuDomain,
  deviceDomain,
  signatureDomain,
  scannerDomain,
  captureDomain,
  captureDialogDomain,
  printDomain,
  overlayDomain,
  notificationDomain,
] as const

/** 平台域名单词表：typo 编译报错 */
export type DesktopDomainName = (typeof platformDomains)[number]['domain']

/** 窗口域挂载清单：'*' 全量（Shell 恒用），数组为白名单（未挂载的域 Main / preload 双侧拒绝）。构造点常量须经 DesktopDomainName 单词表校验 */
export type DesktopDomains = '*' | readonly string[]

/**
 * 业务 Tab 共用能力包：硬件操作 / 打印 / 存储 / 通知，
 * 外加 window（套壳业务页合法退出入口 quit，不设关卡）与 app（getCurrent 取调用者上下文）。
 * tabs / update / cache / permission / overlay / download 为 Shell 与浮层窗专属，业务 Tab 不挂载。
 */
export const CAPABILITY_BUSINESS = [
  'window',
  'app',
  'storage',
  'device',
  'signature',
  'scanner',
  'capture',
  'print',
  'notification',
] as const satisfies readonly DesktopDomainName[]

/** 生成 `--desktop-domains` 启动参数：preload 解析后按清单挂桥（fail-closed，未声明 = 挂空桥） */
export function desktopDomainsArg(domains: DesktopDomains): string {
  return `--desktop-domains=${domains === '*' ? '*' : domains.join(',')}`
}

/** 域对象再导出：Main 侧实现（广播通道等）直接取用 */
export { captureDialogDomain, captureDomain, deviceDomain, printDomain, scannerDomain, signatureDomain } from './devices'

/** 契约中 invoke 形态的 channel 子集：Main 侧 handle 包装 / Preload invoke 只看这里 */
export type DesktopInvoke = {
  [
  K in keyof DesktopIpc as DesktopIpc[K] extends (...args: never[]) => unknown ? K : never
  ]: DesktopIpc[K]
}
