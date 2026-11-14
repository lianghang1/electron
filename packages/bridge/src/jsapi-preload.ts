import { contextBridge, ipcRenderer } from 'electron'

/**
 * 应用页可订阅的设备事件白名单：与域 handler ctx.push 的点对点推送面严格一致。
 * 高频帧（capture.frame）与流式数据（scanner.scanned / signature.stroke）不经
 * 全量广播，只送达发起方视图；devices.ready 是守护进程预热完成的全局信号。
 */
const DEVICE_EVENT_NAMES: ReadonlySet<string> = new Set([
  'capture.frame',
  'scanner.scanned',
  'signature.stroke',
  'devices.ready',
])

/**
 * JSAPI 受控桥：应用页面的唯一能力出口（飞书 JSAPI 模式）。
 * 与完整壳桥（shell）的区别——只有设备域 invoke 与白名单事件订阅，主进程侧
 * 按 manifest.devices 过滤（未声明的域直接拒绝）+ senderFrame.origin 白名单二次校验。
 * 注入方式：WebContentsView webPreferences.preload（见 LocalOpener / RemoteOpener）。
 */
contextBridge.exposeInMainWorld('jsapi', {
  /** 设备能力调用：method 须形如 "<域名>.<方法>"，域名必须在 manifest.devices 声明内 */
  invokeDevice: (method: string, input: unknown) =>
    ipcRenderer.invoke('jsapi:call', method, input),
  /**
   * 设备事件订阅：name 必须在白名单内（越名直接拒绝并返回空退订函数）。
   * 返回退订函数，面板卸载时调用以免视图销毁后仍挂监听。
   */
  onDeviceEvent: (name: string, callback: (payload: unknown) => void) => {
    if (!DEVICE_EVENT_NAMES.has(name)) { return () => {} }
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown): void => { callback(payload) }
    ipcRenderer.on(`event:${name}`, listener)
    return () => { ipcRenderer.removeListener(`event:${name}`, listener) }
  },
})
