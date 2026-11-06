import { contextBridge, ipcRenderer } from 'electron'

/**
 * 渲染层唯一桥面（铁律三：每层之间一个门面）。
 * 本文件集中暴露全部 contextBridge 能力——安全审计只看这一处。
 * 域方法按 @shell/shared 的域签名调用：invoke('domain.method', input)，
 * 运行时校验由主进程侧按 zod schema 执行。
 *
 * remote 页面不经过本桥（它们拿 JSAPI 受控桥，按 manifest.devices 过滤）。
 */

const desktop = {
  /** 通用域方法调用端：invoke('idcard.read', input) */
  invoke: (method: string, input: unknown) => ipcRenderer.invoke('domain-call', method, input),

  /** 平台事件订阅（事件名与载荷契约见 @shell/shared events） */
  onEvent: (event: string, handler: (payload: unknown) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: unknown) => handler(payload)
    ipcRenderer.on(`event:${event}`, listener)
    return () => ipcRenderer.removeListener(`event:${event}`, listener)
  },

  /** 窗口控制（自绘标题栏按钮） */
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },

  /** 启动打点回传（渲染层 T4 首帧） */
  markFirstPaint: () => ipcRenderer.send('launch-mark:t4'),
}

export type DesktopBridge = typeof desktop

contextBridge.exposeInMainWorld('desktop', desktop)
