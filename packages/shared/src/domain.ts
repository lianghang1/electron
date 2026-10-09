/**
 * 域契约定义原语：「契约定义即映射」。
 *
 * 域文件用 defineDomain(域名, 签名定义) 一次声明，同时产出三份映射：
 * - 通道契约类型：`${domain}:${方法名}` 为键（DesktopIpc 并集成员）
 * - Renderer API 分组类型：invoke 通道 → Promise 方法（DesktopApi 分组成员）
 * - 运行时通道表：preload 桥方法与 $invoke 白名单的唯一来源
 *
 * 通道命名统一 `domain:camelMethod`；通道形态由签名形态区分：
 * 函数签名 = 请求-响应（invoke），元组签名 = Main → Renderer 推送（push）。
 * 签名桩仅承载类型（假实现），运行时是零成本占位对象。
 */

// 运行时真实 symbol（const Symbol() 即 unique symbol 类型）：类型层作属性键，运行时作 in 判别键
const invokeBrand = Symbol('invokeSig')
const pushBrand = Symbol('pushSig')

/** invoke 通道签名桩：T = `(...args) => result` 契约签名（返回值可同步可异步） */
export interface InvokeSig<T extends (...args: any[]) => unknown> {
  readonly [invokeBrand]: T
}

/** push 事件签名桩：T = `[...args]` 元组，即监听回调的参数表 */
export interface PushSig<T extends readonly unknown[]> {
  readonly [pushBrand]: T
}

/** 声明 invoke 通道签名：Main 侧 handle 注册，Renderer 侧 Promise 调用 */
export function invoke<T extends (...args: any[]) => unknown>(): InvokeSig<T> {
  // 运行时值仅作桩：brand 键参与 in 判别，载荷类型只在类型层存在
  return { [invokeBrand]: null } as unknown as InvokeSig<T>
}

/** 声明推送事件签名：Main 侧 webContents.send(channel, ...args)，Renderer 侧 desktop.events.on 订阅 */
export function push<T extends readonly unknown[]>(): PushSig<T> {
  return { [pushBrand]: null } as unknown as PushSig<T>
}

/** 域签名定义表：方法名 → 签名桩 */
export type DomainDefs = Record<string, InvokeSig<(...args: any[]) => unknown> | PushSig<readonly unknown[]>>

/** 签名桩 → 契约签名 */
export type SigOf<S> = S extends InvokeSig<infer T> ? T : S extends PushSig<infer T> ? T : never

/** 域通道契约：方法名映射为 `${domain}:${方法名}` 通道键，签名原样保留 */
export type DomainContract<D extends string, Defs extends DomainDefs> = {
  [K in keyof Defs & string as `${D}:${K}`]: SigOf<Defs[K]>
}

/** 域定义值：运行时通道表（preload 桥与白名单来源）+ 类型层签名定义 */
export interface DomainValue<D extends string, Defs extends DomainDefs> {
  /** 域名（通道前缀，也是 DesktopApi 分组名） */
  readonly domain: D
  /** 签名定义（invoke/push 桩原值，类型层推导源） */
  readonly defs: Defs
  /** 方法名 → 通道全名 */
  readonly channels: { readonly [K in keyof Defs & string]: `${D}:${K}` }
  /** 推送事件通道集合（preload 据它分流；invoke 通道不在其中） */
  readonly eventChannels: ReadonlySet<string>
}

/**
 * 定义能力域：契约定义即映射——签名写一次，通道名 / API 分组 / 运行时表全部自动推导。
 */
export function defineDomain<D extends string, Defs extends DomainDefs>(domain: D, defs: Defs): DomainValue<D, Defs> {
  const channels: Record<string, string> = {}
  const eventChannels = new Set<string>()
  for (const [method, sig] of Object.entries(defs)) {
    const channel = `${domain}:${method}`
    channels[method] = channel
    if (sig !== null && typeof sig === 'object' && pushBrand in sig) {
      eventChannels.add(channel)
    }
  }
  return { domain, defs, channels, eventChannels } as unknown as DomainValue<D, Defs>
}

/** 从域定义值提取通道契约（DesktopIpc 并集成员） */
export type DomainIpc<V extends DomainValue<string, DomainDefs>> = DomainContract<V['domain'], V['defs']>

/** 契约签名 → Renderer API 方法：参数原样，返回值 Promise 化 */
type ApiMethod<T> = T extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never

/** 域 API 分组：组名 = 域名，仅含 invoke 通道（推送事件走 desktop.events.on，不进分组） */
export type DomainApi<V extends DomainValue<string, DomainDefs>> = {
  [G in V['domain']]: {
    [K in keyof V['defs'] & string as V['defs'][K] extends PushSig<readonly unknown[]> ? never : K]: ApiMethod<SigOf<V['defs'][K]>>
  }
}

/** window.desktop 桥的最小运行时面（renderer 环境） */
interface DesktopBridge {
  $invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
}

/** 惰性取桥：经 globalThis 避免 node lib 无 DOM；缺失即显式报错而非 undefined 崩溃 */
function getBridge(): DesktopBridge {
  const bridge = (globalThis as { desktop?: DesktopBridge }).desktop
  if (!bridge) {
    throw new Error('desktop bridge not found: 请确认 preload 已调用 exposeDesktop()')
  }
  return bridge
}

/**
 * 由域定义值生成 Renderer 类型化 API 分组（invoke 通道 → Promise 方法）。
 * 运行时经 window.desktop.$invoke 转发，通道须在 preload appChannels 白名单内；
 * push 通道不进分组，仍经 window.desktop.events.on 订阅。
 * App 自有域进不了平台 DesktopApi 并集（平台包不含业务词汇），渲染层用本工厂
 * 一行收口替代手写 invoke 包装：通道 / 入参 / 返回值类型全部由域契约推导。
 */
export function createDomainApi<D extends DomainValue<string, DomainDefs>>(domain: D): DomainApi<D>[D['domain']] {
  const group: Record<string, unknown> = {}
  for (const [method, channel] of Object.entries(domain.channels)) {
    if (domain.eventChannels.has(channel)) {
      continue
    }
    group[method] = (...args: unknown[]) => getBridge().$invoke(channel, ...args)
  }
  return group as DomainApi<D>[D['domain']]
}
