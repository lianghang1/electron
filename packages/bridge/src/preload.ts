import { contextBridge, ipcRenderer } from 'electron'

/**
 * 渲染层唯一桥面（铁律三：每层之间一个门面）。
 * 本文件集中暴露全部 contextBridge 能力——安全审计只看这一处。
 * 域方法按 @shell/shared 的域签名调用：invoke('domain.method', input)，
 * 运行时校验由主进程侧按 zod schema 执行。
 *
 * remote 页面不经过本桥（它们拿 JSAPI 受控桥，按 manifest.devices 过滤）。
 */

export const desktop = {
  /** 通用域方法调用端：invoke('idcard.read', input) */
  invoke: (method: string, input: unknown) => ipcRenderer.invoke('domain-call', method, input),

  /** 平台事件订阅（事件名与载荷契约见 @shell/shared events） */
  onEvent: (event: string, handler: (payload: unknown) => void) => {
    // 通道映射：扫码内容由 ScanService 直推 webContents（旧通道名），对渲染层统一为事件名
    const channel = event === 'scanner.scanned' ? 'scanner:scanReceived' : `event:${event}`
    const listener = (_e: Electron.IpcRendererEvent, payload: unknown) => handler(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },

  /** 应用运行时：打开 / 关闭 / 激活 / 清单 */
  apps: {
    list: () => ipcRenderer.invoke('app:list'),
    open: (appId: string) => ipcRenderer.invoke('app:open', appId),
    close: (instanceId: string) => ipcRenderer.invoke('app:close', instanceId),
    /** 切到某实例的视图（embedded 切换由渲染层本地完成，无需过桥） */
    activate: (instanceId: string) => ipcRenderer.invoke('app:activate', instanceId),
  },

  /** 内容区矩形上报：WebContentsView 的布局依据（渲染层自绘 chrome，主进程不猜） */
  reportContentRect: (rect: { x: number, y: number, width: number, height: number }) =>
    ipcRenderer.send('view:content-rect', rect),

  /** 窗口控制（自绘标题栏按钮） */
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },

  /** 壳信息：品牌名 / 应用版本 / 启动直达目标（空状态页消费） */
  shell: {
    info: () => ipcRenderer.invoke('shell:info') as Promise<{ name: string, version: string, defaultAppId?: string }>,
  },

  /** 设置（schema 驱动） */
  settings: {
    all: () => ipcRenderer.invoke('settings:all'),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
  },

  /** 启动打点回传（渲染层 T4 首帧） */
  markFirstPaint: () => ipcRenderer.send('launch-mark:t4'),
}

export type DesktopBridge = typeof desktop

contextBridge.exposeInMainWorld('desktop', desktop)
