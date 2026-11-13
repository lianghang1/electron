import { decodeIpcError, IpcRemoteError, shellDomains } from '@shell/shared/ipc'
import { contextBridge, ipcRenderer } from 'electron'

/**
 * 渲染层唯一桥面：每层之间一个门面。
 * 本文件集中暴露全部 contextBridge 能力——安全审计只看这一处。
 * 壳设施方法由 @shell/shared ipc 域运行时表（shellDomains）通用生成：
 * invoke → Promise 方法 / send → fire-and-forget / push → onXxx 订阅，
 * 新增壳通道零改动（契约文件 + shellDomains 一行即可）。
 * 设备域不走生成面：invoke('domain.method') 单通道 + onEvent 事件订阅，
 * 运行时校验由主进程侧按 zod schema 执行。
 *
 * 本文件必须与沙箱 preload 白名单兼容（electron/events/timers/url 四个模块 +
 * polyfill 的 process 全局）——只 import node:process 就会迫使主窗关沙箱：
 * process.argv 读启动参数用沙箱 polyfill 的全局 process，不要 import。
 *
 * remote 页面不经过本桥（它们拿 JSAPI 受控桥，按 manifest.devices 过滤）。
 */

/** 启动外观与布局档位：由组合根经 additionalArguments 同步送达，避免异步 IPC 造成的首帧闪烁 */
function readBootAppearance(): { accent: string, theme: 'light' | 'dark' | 'system', chrome: 'platform' | 'solo' } {
  const pick = (prefix: string, fallback: string) =>
    process.argv.find(a => a.startsWith(prefix))?.slice(prefix.length) ?? fallback
  const accent = pick('--shell-accent=', '#4f46e5')
  const theme = pick('--shell-theme=', 'system')
  const chrome = pick('--shell-chrome=', 'platform')
  return {
    accent,
    theme: theme === 'light' || theme === 'dark' ? theme : 'system',
    chrome: chrome === 'solo' ? 'solo' : 'platform',
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

/**
 * invoke 统一出口：主进程 shellHandle 抛出的异常已编码进 message，
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
  const wrapped = (_e: Electron.IpcRendererEvent, ...args: unknown[]) => listener(...args)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

// 壳设施分组由域运行时表生成；根域（system）方法直接挂桥面根
const shellBridge: Record<string, unknown> = {
  /** 设备域通用调用端：invoke('print.submitJob', input)（zod 校验 + 权限闸门在主进程路由层） */
  invoke: (method: string, input: unknown) => ipcRenderer.invoke('domain-call', method, input),

  /** 平台事件订阅（事件名与载荷契约见 @shell/shared events） */
  onEvent: (event: string, handler: (payload: unknown) => void) => {
    // 通道映射：扫码内容由 ScanService 直推 webContents（旧通道名），对渲染层统一为事件名
    const channel = event === 'scanner.scanned' ? 'scanner:scanReceived' : `event:${event}`
    return subscribe(channel, payload => handler(payload))
  },
}

for (const domain of shellDomains) {
  const group: Record<string, unknown> = {}
  for (const [method, channel] of Object.entries(domain.invokeChannels)) {
    group[method] = (...args: unknown[]) => invokeChannel(channel, ...args)
  }
  for (const [method, channel] of Object.entries(domain.sendChannels)) {
    group[method] = (...args: unknown[]) => { ipcRenderer.send(channel, ...args) }
  }
  for (const [method, channel] of Object.entries(domain.pushChannels)) {
    const onName = `on${method.charAt(0).toUpperCase()}${method.slice(1)}`
    group[onName] = (handler: (...args: unknown[]) => void) => subscribe(channel, handler)
  }
  if (domain.root) {
    Object.assign(shellBridge, group)
  }
  else {
    shellBridge[domain.domain] = group
  }
}

// 同步快照方法：appearance 读启动参数不经 IPC，挂进 shell 分组（契约外唯一手工成员）
;(shellBridge.shell as Record<string, unknown>).appearance = () => bootAppearance

// exposeInMainWorld 的 api 参数为 any：桥面结构由 ShellBridge 契约类型约束
contextBridge.exposeInMainWorld('shell', shellBridge)
