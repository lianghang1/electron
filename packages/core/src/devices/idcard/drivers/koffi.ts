import { createRequire } from 'node:module'
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

/** koffi 是否已安装（进程级常量）：设备枚举据此产出状态提示，requireKoffi 兜底 */
export function koffiAvailable(): boolean {
  try {
    nodeRequire.resolve('koffi')
    return true
  }
  catch {
    return false
  }
}

/**
 * 运行时解析 koffi 模块（构建期零依赖，真机联调时 npm i koffi）；
 * 缺失时抛 ADAPTER_UNAVAILABLE（dll-adapter 先用 koffiAvailable 预检产出设备状态，这里兜底）。
 */
export function requireKoffi(detail?: unknown): { load: (path: string) => KoffiLib } {
  let koffi: { load: (path: string) => KoffiLib }
  try {
    koffi = nodeRequire('koffi')
  }
  catch {
    throw idCardError('ADAPTER_UNAVAILABLE', '未安装 koffi 依赖（npm i koffi）', detail)
  }
  return koffi
}
