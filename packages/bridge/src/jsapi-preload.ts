import { contextBridge, ipcRenderer } from 'electron'

/**
 * JSAPI 受控桥：remote 形态页面的唯一能力出口（飞书 JSAPI 模式）。
 * 与完整壳桥（shell）的区别——只有设备域 invoke，且主进程侧按 manifest.devices
 * 过滤（未声明的域直接拒绝）+ senderFrame.origin 白名单二次校验。
 * 注入方式：WebContentsView webPreferences.preload（见 RemoteOpener）。
 */
contextBridge.exposeInMainWorld('jsapi', {
  /** 设备能力调用：method 须形如 "<域名>.<方法>"，域名必须在 manifest.devices 声明内 */
  invokeDevice: (method: string, input: unknown) =>
    ipcRenderer.invoke('jsapi:call', method, input),
})
