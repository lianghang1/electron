import { contextBridge, ipcRenderer } from 'electron'

/**
 * 渲染层唯一桥面：每层之间一个门面。
 * 本文件集中暴露全部 contextBridge 能力——安全审计只看这一处。
 * 域方法按 @shell/shared 的域签名调用：invoke('domain.method', input)，
 * 运行时校验由主进程侧按 zod schema 执行。
 *
 * 本文件必须与沙箱 preload 白名单兼容（electron/events/timers/url 四个模块 +
 * polyfill 的 process 全局）——只 import node:process 就会迫使主窗关沙箱：
 * process.argv 读启动参数用沙箱 polyfill 的全局 process，不要 import。
 *
 * remote 页面不经过本桥（它们拿 JSAPI 受控桥，按 manifest.devices 过滤）。
 */

/** 启动外观：由组合根经 additionalArguments 同步送达，避免异步 IPC 造成的首帧闪烁 */
function readBootAppearance(): { accent: string, theme: 'light' | 'dark' | 'system' } {
  const pick = (prefix: string, fallback: string) =>
    process.argv.find(a => a.startsWith(prefix))?.slice(prefix.length) ?? fallback
  const accent = pick('--shell-accent=', '#3b82f6')
  const theme = pick('--shell-theme=', 'system')
  return {
    accent,
    theme: theme === 'light' || theme === 'dark' ? theme : 'system',
  }
}

const bootAppearance = readBootAppearance()

/** preload 阶段尽早写 :root：内联 splash 与 Vue 首帧都吃到同一个 flavor 主色 */
function injectBootAppearance(): void {
  const apply = () => {
    const root = document.documentElement
    if (!root) { return }
    root.style.setProperty('--dt-accent', bootAppearance.accent)
    const dark = bootAppearance.theme === 'dark'
      || (bootAppearance.theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
    if (dark) { root.dataset.theme = 'dark' }
  }
  if (document.documentElement) { apply() }
  else { document.addEventListener('DOMContentLoaded', apply, { once: true }) }
}

injectBootAppearance()

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
    isMaximized: () => ipcRenderer.invoke('window:is-maximized') as Promise<boolean>,
    restore: () => ipcRenderer.invoke('window:restore'),
    setAlwaysOnTop: (flag: boolean) => ipcRenderer.invoke('window:set-always-on-top', flag),
    flash: (flag: boolean) => ipcRenderer.invoke('window:flash', flag),
    close: () => ipcRenderer.invoke('window:close'),
    quit: () => ipcRenderer.invoke('window:quit'),
  },

  /** 壳信息：版本 / 直达目标 / chrome 档位 / 平台能力（渲染层按档位决定挂不挂壳界面） */
  shell: {
    info: () => ipcRenderer.invoke('shell:info') as Promise<{
      name: string
      version: string
      defaultAppId?: string
      chrome: 'platform' | 'solo'
      mode: 'desktop' | 'kiosk'
      /** 强制更新门禁快照（清单 minVersion 与当前版本比对的结果） */
      forceUpdate?: { blocked: boolean, requiredVersion?: string }
      capabilities: {
        platform: string
        availableDomains: string[]
        driverDeployment: string
        notes?: string
      }
    }>,
    /** 启动外观同步快照（读启动参数，不经 IPC） */
    appearance: () => bootAppearance,
    /** 重启壳：先 relaunch 再 quit，before-quit 钩子会执行暂存的整包安装 */
    relaunch: () => ipcRenderer.invoke('shell:relaunch') as Promise<void>,
    /** 立即巡检并应用更新（门禁页主动更新入口），结果经事件回传 */
    updateNow: () => ipcRenderer.invoke('shell:update-now') as Promise<void>,
  },

  /** 设置（schema 驱动） */
  settings: {
    all: () => ipcRenderer.invoke('settings:all'),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
  },

  /** 下载任务：按 taskId 间接寻址，页面无法用任意路径触达文件系统 */
  downloads: {
    list: () => ipcRenderer.invoke('download:list'),
    cancel: (taskId: string) => ipcRenderer.invoke('download:cancel', taskId),
    open: (taskId: string) => ipcRenderer.invoke('download:open', taskId),
    reveal: (taskId: string) => ipcRenderer.invoke('download:reveal', taskId),
    dismiss: (taskId: string) => ipcRenderer.invoke('download:dismiss', taskId),
  },

  /** 应用会话数据：清缓存不影响登录态，清站点数据等于该应用登出 */
  sessions: {
    clearCache: (appId: string) => ipcRenderer.invoke('session:clear-cache', appId),
    clearSiteData: (appId: string) => ipcRenderer.invoke('session:clear-site', appId),
  },

  /** 应用隔离 KV：身份由主进程账本反查，页面无法读写别的应用 */
  storage: {
    get: (key: string) => ipcRenderer.invoke('storage:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('storage:set', key, value),
    remove: (key: string) => ipcRenderer.invoke('storage:remove', key),
    clear: () => ipcRenderer.invoke('storage:clear'),
    keys: () => ipcRenderer.invoke('storage:keys'),
    snapshot: () => ipcRenderer.invoke('storage:snapshot'),
  },

  /** 统一消息通道：toast / 通知中心 / 下载卡共用一份 TTL */
  notifications: {
    show: (input: { title: string, body?: string, level?: string, ttlMs?: number }) =>
      ipcRenderer.invoke('notification:show', input) as Promise<string>,
    dismiss: (id: string) => ipcRenderer.invoke('notification:dismiss', id),
    list: () => ipcRenderer.invoke('notification:list'),
  },

  /** 更新状态查询 / 取消 / 安装（渲染层不再只能被动收事件） */
  update: {
    state: () => ipcRenderer.invoke('update:state'),
    cancel: () => ipcRenderer.invoke('update:cancel'),
    install: () => ipcRenderer.invoke('update:install'),
  },

  /** 运行时权限：应用主动查询 / 请求 / 重置 */
  permissions: {
    query: (permission: string) => ipcRenderer.invoke('permission:query', permission) as Promise<boolean>,
    /** 主动请求运行时授权：打开原生浮层，结论持久化后不再反复打扰 */
    request: (permission: string) => ipcRenderer.invoke('permission:request', permission) as Promise<boolean>,
    list: () => ipcRenderer.invoke('permission:list'),
    reset: (permission: string) => ipcRenderer.invoke('permission:reset', permission),
  },

  /** Tab 细粒度控制 */
  tabs: {
    reload: (instanceId: string) => ipcRenderer.invoke('tabs:reload', instanceId),
    setWorkArea: (rect: { x: number, y: number, width: number, height: number }) =>
      ipcRenderer.send('view:content-rect', rect),
  },

  /** 原生浮层宿主：所有要盖过应用 view 的 UI 统一从这里开窗 */
  overlay: {
    sync: () => ipcRenderer.invoke('overlay:sync'),
    open: (kind: string, params?: Record<string, string>) => ipcRenderer.invoke('overlay:open', kind, params),
    dismiss: (kind: string) => ipcRenderer.invoke('overlay:dismiss', kind),
    action: (action: unknown) => ipcRenderer.invoke('overlay:action', action),
    resize: (height: number) => ipcRenderer.invoke('overlay:resize', height),
    mouseIgnore: (ignore: boolean) => ipcRenderer.invoke('overlay:mouse-ignore', ignore),
    onUpdated: (handler: (state: unknown) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, state: unknown) => handler(state)
      ipcRenderer.on('overlay:updated', listener)
      return () => ipcRenderer.removeListener('overlay:updated', listener)
    },
  },

  /** 启动打点回传（渲染层 T4 首帧） */
  markFirstPaint: () => ipcRenderer.send('launch-mark:t4'),

  /** 拍摄浮层会话：发起方开/关会话，浮层窗内预览与结果回传 */
  captureDialog: {
    open: (input: unknown) => ipcRenderer.invoke('capture:open-dialog', input),
    close: () => ipcRenderer.invoke('capture:close-dialog'),
    startPreview: (deviceId: string, resolutionNum?: number) =>
      ipcRenderer.invoke('capture:dialog-preview-start', { deviceId, resolutionNum }),
    stopPreview: () => ipcRenderer.invoke('capture:dialog-preview-stop'),
    snap: (opts?: { dataUrl?: string, meta?: Record<string, unknown> }) => ipcRenderer.invoke('capture:dialog-snap', opts ?? {}),
    confirm: (results: unknown[]) => ipcRenderer.invoke('capture:dialog-confirm', results),
    onFrame: (handler: (frame: { deviceId: string, base64: string }) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, frame: { deviceId: string, base64: string }) => handler(frame)
      ipcRenderer.on('capture:frameReceived', listener)
      return () => ipcRenderer.removeListener('capture:frameReceived', listener)
    },
  },
}

export type DesktopBridge = typeof desktop

contextBridge.exposeInMainWorld('desktop', desktop)
