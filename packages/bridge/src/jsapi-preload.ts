import { APP_EVENT_WHITELIST } from '@shell/shared/events'
import { contextBridge, ipcRenderer } from 'electron'

/**
 * 设备服务直推通道（非 `event:` 总线命名）：设备网关以 `${域}:${方法}` 通道
 * 广播全 webContents，应用桥按事件名映射到对应通道。
 */
const DIRECT_PUSH_CHANNELS: Readonly<Record<string, string>> = {
  'scanner.scanned': 'scanner:scanReceived',
  'scanner.statusUpdated': 'scanner:statusUpdated',
}

/**
 * JSAPI 受控桥：应用页面的唯一能力出口（飞书 JSAPI 模式）。
 * 与完整壳桥（shell）的区别——只有受控 invoke 与白名单事件订阅，主进程侧
 * 按 manifest 声明过滤（未声明的域/权限直接拒绝）+ caller 登记身份判定。
 * 注入方式：WebContentsView webPreferences.preload（见 LocalOpener / RemoteOpener）。
 */
contextBridge.exposeInMainWorld('jsapi', {
  /** 受控能力调用：method 须形如 "<域名>.<方法>"，域须在 manifest 声明内 */
  invokeDevice: (method: string, input: unknown) =>
    ipcRenderer.invoke('jsapi:call', method, input),
  /**
   * 平台事件订阅：name 必须在白名单内（越名直接拒绝并返回空退订函数）。
   * 返回退订函数，面板卸载时调用以免视图销毁后仍挂监听。
   */
  onDeviceEvent: (name: string, callback: (payload: unknown) => void) => {
    if (!(APP_EVENT_WHITELIST as readonly string[]).includes(name)) { return () => {} }
    const channel = DIRECT_PUSH_CHANNELS[name] ?? `event:${name}`
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown): void => { callback(payload) }
    ipcRenderer.on(channel, listener)
    return () => { ipcRenderer.removeListener(channel, listener) }
  },
})
