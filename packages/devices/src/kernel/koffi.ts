import type { Buffer } from 'node:buffer'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

/** koffi 声明的原生函数（返回值/入参类型由签名字符串声明，出参经 Buffer 手工解析） */
export type KoffiFn = (...args: unknown[]) => unknown

/** koffi LoadLibrary 句柄面 */
export interface KoffiLib {
  func: (signature: string) => KoffiFn
}

/** koffi 模块面：LoadLibrary + 出参缓冲区分配/解码/取址（结构体与指针出参经 Buffer 手工解析） */
export interface KoffiModule {
  load: (path: string) => KoffiLib
  alloc: (type: string, count: number) => Buffer
  decode: (value: unknown, offset?: number, type?: string | object) => unknown
  /** 取 Buffer 的内存地址（BigInt），用于把"指向缓冲区内部的指针"换算成偏移 */
  address: (value: unknown) => bigint | number
}

const nodeRequire = createRequire(import.meta.url)

/**
 * 打包态的 koffi 分发目录（afterPack 钩子拷入 <resourcesPath>/node_modules，跟整包更新）。
 * .node 原生库无法进 asar（dlopen 限制），且热更 asar 位于 userData、其模块解析链走不到
 * 安装目录——原生依赖必须放 asar 外真实目录并在此显式锚定，内置包 / 热更包 / device-host
 * 守护进程三种运行形态共用本入口。
 * dev 态 process.resourcesPath 指向 electron 发行包内目录（无 node_modules/koffi），走裸模块名解析。
 */
const packagedKoffiDir = process.resourcesPath
  ? path.join(process.resourcesPath, 'node_modules', 'koffi')
  : undefined

function packagedKoffiPresent(): boolean {
  return Boolean(packagedKoffiDir && existsSync(path.join(packagedKoffiDir, 'package.json')))
}

/** koffi 加载失败的结构化错误：code 穿越守护进程 IPC 供调用链分支（ADAPTER_UNAVAILABLE 为设备域通用码） */
class KoffiUnavailableError extends Error {
  readonly code = 'ADAPTER_UNAVAILABLE'
  readonly detail?: unknown

  constructor(message: string, detail?: unknown) {
    super(message)
    this.name = 'KoffiUnavailableError'
    this.detail = detail
  }
}

/** koffi 是否可用（进程级常量）：设备枚举据此产出状态提示，requireKoffi 兜底 */
export function koffiAvailable(): boolean {
  if (packagedKoffiPresent()) {
    return true
  }
  try {
    nodeRequire.resolve('koffi')
    return true
  }
  catch {
    return false
  }
}

/**
 * 运行时加载 koffi 模块（构建期零依赖）；
 * 缺失时抛 ADAPTER_UNAVAILABLE（dll-adapter 先用 koffiAvailable 预检产出设备状态，这里兜底）。
 */
export function requireKoffi(detail?: unknown): KoffiModule {
  let koffi: KoffiModule
  try {
    const dir = packagedKoffiDir
    koffi = dir && packagedKoffiPresent() ? nodeRequire(dir) : nodeRequire('koffi')
  }
  catch {
    throw new KoffiUnavailableError('koffi 不可用（dev: npm i koffi；打包: 缺 resources/node_modules/koffi）', detail)
  }
  return koffi
}
