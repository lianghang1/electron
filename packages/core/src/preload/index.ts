import type { DesktopApi } from '@desktop/shared'
import type { IpcRendererEvent } from 'electron'
import { decodeIpcError, IpcRemoteError, platformDomains } from '@desktop/shared'
import { contextBridge, ipcRenderer } from 'electron'

export interface DesktopBridgeOptions {
  /**
   * App 业务通道白名单（app 本地契约，如 'crm:query'）。
   * 与 Main 侧 createHandle<AppIpc>() 注册的通道保持一致；
   * 白名单外的 channel 在 $invoke 处直接拒绝，保持最小桥。
   */
  appChannels?: readonly string[]
}

/**
 * 暴露 window.desktop 平台桥：只暴露 DesktopApi 声明的方法，不暴露裸 ipcRenderer。
 * 平台方法由域运行时表（platformDomains）通用生成——invoke 通道 → Promise 方法，
 * 新增平台通道零改动；推送事件经 desktop.events.on 订阅
 * （推送目标由 Main 决定，订阅不做裁剪）。
 * 身份不经过参数：Main 侧按 event.sender 反查 CallerContext；越权动作由 Main 侧
 * 身份关卡（assertShell / PermissionService / isOverlay）拒绝。
 * 无业务通道的 App 直接 exposeDesktop()；有业务通道的 App 声明白名单。
 */
export function exposeDesktop(options: DesktopBridgeOptions = {}): void {
  // $invoke 白名单：平台 invoke 通道 + App 业务通道（推送事件不走 $invoke，不进白名单）
  const allowedChannels = new Set<string>(options.appChannels ?? [])
  const desktop: Record<string, unknown> = {}

  for (const domain of platformDomains) {
    const group: Record<string, unknown> = {}
    for (const [method, channel] of Object.entries(domain.channels)) {
      if (domain.eventChannels.has(channel)) {
        continue
      }
      allowedChannels.add(channel)
      group[method] = (...args: unknown[]) => invokeChannel(channel, ...args)
    }
    desktop[domain.domain] = group
  }

  desktop.$invoke = (channel: string, ...args: unknown[]) => {
    if (!allowedChannels.has(channel)) {
      throw new Error(`ipc channel not exposed: ${channel}`)
    }
    return invokeChannel(channel, ...args)
  }
  desktop.events = {
    on: (channel: string, listener: (...args: unknown[]) => void) => subscribe(channel, listener),
  }

  try {
    contextBridge.exposeInMainWorld('desktop', desktop as unknown as DesktopApi)
  }
  catch (error) {
    console.error(error)
  }
}

/**
 * invoke 统一出口：主进程 createHandle 抛出的异常已编码进 message，
 * 在此还原为带 code/details 的 IpcRemoteError（业务按错误码分支）；
 * 非平台序列化错误（桥自身/网络层）原样透传。
 */
function invokeChannel(channel: string, ...args: unknown[]): Promise<unknown> {
  return ipcRenderer.invoke(channel, ...args).catch((error: unknown) => {
    const payload = decodeIpcError(error)
    throw payload ? new IpcRemoteError(payload) : error
  })
}

/** 推送订阅包装：剥掉 Electron event 首参只透传契约负载数据，返回取消监听函数 */
function subscribe(channel: string, listener: (...args: unknown[]) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, ...args: unknown[]) => listener(...args)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}
