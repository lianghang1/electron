/**
 * 壳设施 IPC 契约原语：「契约定义即映射」。
 *
 * 域文件用 defineIpcDomain(域名, 签名定义) 一次声明，同时产出三份映射：
 * - 通道契约类型：`${domain}:${方法名}` 为键（ShellIpc 并集成员，主进程 handle/on 注册键）
 * - Renderer API 分组：invoke → Promise 方法 / send → fire-and-forget / push → onXxx 订阅
 * - 运行时通道表：preload 桥方法生成的唯一来源（新增通道零改动）
 *
 * 通道命名统一 `domain:camelMethod`，与 packages/window、packages/kernel 内
 * 既有注册字面量保持同形（window / overlay / settings 各域无需迁移）。
 * 通道形态由签名桩区分：
 * - invoke  函数签名 = 请求-响应（ipcMain.handle / ipcRenderer.invoke）
 * - send    函数签名 + 单向无回执（ipcMain.on / ipcRenderer.send，高频或无返回值）
 * - push    元组签名 = Main → Renderer 推送（webContents.send / onXxx 订阅）
 * 签名桩仅承载类型：品牌属性可选（T | null），运行时以 null 填充即可
 * 通过 in 判别形态，类型层由 SigOf 的条件分发把 null 滤掉——零断言。
 */

// 运行时真实 symbol（const Symbol() 即 unique symbol 类型）：类型层作属性键，运行时作 in 判别键
const invokeBrand = Symbol('ipcInvokeSig')
const pushBrand = Symbol('ipcPushSig')
const sendBrand = Symbol('ipcSendSig')

/** invoke 通道签名桩：T = `(...args) => result` 契约签名（返回值可同步可异步） */
export interface InvokeSig<T extends (...args: any[]) => unknown> {
  readonly [invokeBrand]?: T | null
}

/** push 事件签名桩：T = `[...args]` 元组，即监听回调的参数表 */
export interface PushSig<T extends readonly unknown[]> {
  readonly [pushBrand]?: T | null
}

/** send 通道签名桩：T = `(...args) => void`，单向发送无回执 */
export interface SendSig<T extends (...args: any[]) => unknown> {
  readonly [sendBrand]?: T | null
}

/** 声明 invoke 通道签名：Main 侧 shellHandle 注册，Renderer 侧 Promise 调用 */
export function invoke<T extends (...args: any[]) => unknown>(): InvokeSig<T> {
  return { [invokeBrand]: null }
}

/** 声明推送事件签名：Main 侧 webContents.send(channel, ...args)，Renderer 侧 onXxx 订阅 */
export function push<T extends readonly unknown[]>(): PushSig<T> {
  return { [pushBrand]: null }
}

/** 声明单向发送签名：Main 侧 shellOn 注册，Renderer 侧 fire-and-forget */
export function send<T extends (...args: any[]) => unknown>(): SendSig<T> {
  return { [sendBrand]: null }
}

/** 域签名定义表：方法名 → 签名桩 */
export type IpcDefs = Record<string, InvokeSig<(...args: any[]) => unknown> | PushSig<readonly unknown[]> | SendSig<(...args: any[]) => unknown>>

/** 签名桩 → 契约签名（条件分发天然滤掉品牌属性里的 null） */
export type SigOf<S> = S extends InvokeSig<infer T>
  ? (T extends (...args: infer A) => infer R ? (...args: A) => R : never)
  : S extends PushSig<infer T>
    ? (T extends readonly unknown[] ? T : never)
    : S extends SendSig<infer T>
      ? (T extends (...args: infer A) => infer R ? (...args: A) => R : never)
      : never

/** send 签名 → 参数元组（shellOn 的 handler 展开用） */
export type SendArgsOf<S> = S extends SendSig<infer T> ? (T extends (...args: infer A) => unknown ? A : never) : never

/** 域定义值：运行时通道表（preload 桥生成来源）+ 类型层签名定义 */
export interface IpcDomainValue<D extends string, Defs extends IpcDefs> {
  /** 域名（通道前缀，也是 ShellApi 分组名） */
  readonly domain: D
  /** 签名定义（invoke/push/send 桩原值，类型层推导源） */
  readonly defs: Defs
  /** 方法名 → 通道全名（invoke 形态） */
  readonly invokeChannels: Readonly<Record<string, string>>
  /** 方法名 → 通道全名（send 形态） */
  readonly sendChannels: Readonly<Record<string, string>>
  /** 方法名 → 通道全名（push 形态） */
  readonly pushChannels: Readonly<Record<string, string>>
  /** 根域：方法直接挂在 window.桥面根上（跨分组的基础面，如 reportContentRect） */
  readonly root?: true
}

/**
 * 定义壳设施能力域：契约定义即映射——签名写一次，通道名 / API 分组 / 运行时表全部自动推导。
 * 带第三参（{ root: true }）的重载把 root 具化为字面量 true，供根域 API 提升判定。
 */
export function defineIpcDomain<D extends string, Defs extends IpcDefs>(domain: D, defs: Defs, options: { root: true }): IpcDomainValue<D, Defs> & { root: true }
export function defineIpcDomain<D extends string, Defs extends IpcDefs>(domain: D, defs: Defs, options?: { root?: undefined }): IpcDomainValue<D, Defs>
export function defineIpcDomain<D extends string, Defs extends IpcDefs>(
  domain: D,
  defs: Defs,
  options?: { root?: true },
): IpcDomainValue<D, Defs> {
  const invokeChannels: Record<string, string> = {}
  const sendChannels: Record<string, string> = {}
  const pushChannels: Record<string, string> = {}
  for (const [method, sig] of Object.entries(defs)) {
    const channel = `${domain}:${method}`
    if (sig !== null && typeof sig === 'object') {
      if (pushBrand in sig) { pushChannels[method] = channel }
      else if (sendBrand in sig) { sendChannels[method] = channel }
      else { invokeChannels[method] = channel }
    }
  }
  return { domain, defs, invokeChannels, sendChannels, pushChannels, ...options }
}

/** 域通道契约（invoke）：主进程 shellHandle 的注册键与签名 */
export type IpcContract<V extends IpcDomainValue<string, IpcDefs>> = {
  [K in keyof V['defs'] & string as V['defs'][K] extends InvokeSig<any> ? `${V['domain']}:${K}` : never]: SigOf<V['defs'][K]>
}

/** 域发送契约（send）：主进程 shellOn 的注册键与参数元组 */
export type IpcSendContract<V extends IpcDomainValue<string, IpcDefs>> = {
  [K in keyof V['defs'] & string as V['defs'][K] extends SendSig<any> ? `${V['domain']}:${K}` : never]: SendArgsOf<V['defs'][K]>
}

/** 域推送契约（push）：preload 订阅通道与回调参数表 */
export type IpcPushContract<V extends IpcDomainValue<string, IpcDefs>> = {
  [K in keyof V['defs'] & string as V['defs'][K] extends PushSig<readonly unknown[]> ? `${V['domain']}:${K}` : never]: SigOf<V['defs'][K]>
}

/** 契约签名 → Renderer API 方法：参数原样，返回值 Promise 化 */
type ApiMethod<T> = T extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never

/** send 签名 → fire-and-forget 方法 */
type SendMethod<T> = T extends (...args: infer A) => unknown ? (...args: A) => void : never

/** push 签名 → onXxx 订阅方法：回调收到契约负载数据，返回取消监听函数 */
type PushMethod<T> = T extends readonly unknown[] ? (handler: (...args: T) => void) => () => void : never

type OnName<K extends string> = `on${Capitalize<K>}`

/** 域 API 分组：invoke → Promise 方法 / send → void 方法 / push → onXxx 订阅 */
export type ShellDomainApi<V extends IpcDomainValue<string, IpcDefs>> = {
  [G in V['domain']]: {
    [K in keyof V['defs'] & string as V['defs'][K] extends InvokeSig<any> ? K : never]: ApiMethod<SigOf<V['defs'][K]>>
  } & {
    [K in keyof V['defs'] & string as V['defs'][K] extends SendSig<any> ? K : never]: SendMethod<SigOf<V['defs'][K]>>
  } & {
    [K in keyof V['defs'] & string as V['defs'][K] extends PushSig<any> ? OnName<K> : never]: PushMethod<SigOf<V['defs'][K]>>
  }
}
