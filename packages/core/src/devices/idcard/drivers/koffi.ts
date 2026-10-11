import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { idCardError } from '../errors'

/** koffi 声明的原生函数（返回值/入参类型由签名字符串声明，出参经 Buffer 手工解析） */
export type KoffiFn = (...args: unknown[]) => unknown

/** koffi LoadLibrary 句柄面 */
export interface KoffiLib {
  func: (signature: string) => KoffiFn
}

// createRequire 基准：CJS（electron-vite 产物）取 __filename；ESM（tsx 直跑源码联调）无 __filename，退回 cwd（koffi 经根依赖解析）
const nodeRequire = createRequire(
  typeof __filename === 'string' ? __filename : process.cwd(),
)

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
export function requireKoffi(detail?: unknown): { load: (path: string) => KoffiLib } {
  let koffi: { load: (path: string) => KoffiLib }
  try {
    const dir = packagedKoffiDir
    koffi = dir && packagedKoffiPresent() ? nodeRequire(dir) : nodeRequire('koffi')
  }
  catch {
    throw idCardError('ADAPTER_UNAVAILABLE', 'koffi 不可用（dev: npm i koffi；打包: 缺 resources/node_modules/koffi）', detail)
  }
  return koffi
}
