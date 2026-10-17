import type { DomainApi } from '../domain'
import type { DesktopIpc } from './ipc'
import type { appDomain } from './ipc/app'
import type { cacheDomain } from './ipc/cache'
import type { captureDialogDomain, captureDomain, deviceDomain, printDomain, scannerDomain, signatureDomain } from './ipc/devices'
import type { downloadDomain } from './ipc/download'
import type { menuDomain } from './ipc/menu'
import type { notificationDomain } from './ipc/notification'
import type { overlayDomain } from './ipc/overlay'
import type { permissionDomain } from './ipc/permission'
import type { permissionDialogDomain } from './ipc/permission-dialog'
import type { storageDomain } from './ipc/storage'
import type { tabsDomain } from './ipc/tabs'
import type { updateDomain } from './ipc/update'
import type { windowDomain } from './ipc/window'

/**
 * Renderer 可监听的平台推送事件：从契约中 push 形态的 channel 自动推导，
 * 与 Main 侧 emit 保持单一来源。
 */
export type DesktopEvents = {
  [K in keyof DesktopIpc as DesktopIpc[K] extends unknown[] ? K : never]: (
    ...args: DesktopIpc[K] extends unknown[] ? DesktopIpc[K] : never
  ) => void
}

/**
 * window.desktop 桥的类型：Preload 按它实现，Renderer 按它消费。
 * 分组与方法全部由域契约推导（分组 = 域名，方法 = invoke 通道 Promise 化）；
 * 权限 / 存储等敏感能力的实际授权都在 Main。
 */
export type DesktopApi
  = & DomainApi<typeof windowDomain>
    & DomainApi<typeof appDomain>
    & DomainApi<typeof tabsDomain>
    & DomainApi<typeof permissionDomain>
    & DomainApi<typeof permissionDialogDomain>
    & DomainApi<typeof storageDomain>
    & DomainApi<typeof cacheDomain>
    & DomainApi<typeof updateDomain>
    & DomainApi<typeof deviceDomain>
    & DomainApi<typeof signatureDomain>
    & DomainApi<typeof scannerDomain>
    & DomainApi<typeof captureDomain>
    & DomainApi<typeof captureDialogDomain>
    & DomainApi<typeof printDomain>
    & DomainApi<typeof menuDomain>
    & DomainApi<typeof overlayDomain>
    & DomainApi<typeof downloadDomain>
    & DomainApi<typeof notificationDomain>
    & {
      /**
       * App 业务通道统一入口：调用 bootstrap 时经 preload 白名单声明的业务通道
       * （app 本地契约，如 fh:order:query）。平台不感知业务词汇，类型由 App 侧封装收口。
       */
      $invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      events: {
        /** 监听平台推送事件，返回取消监听函数 */
        on: <K extends keyof DesktopEvents>(channel: K, listener: DesktopEvents[K]) => () => void
      }
    }
