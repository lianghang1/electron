/**
 * Electron 内置模块 original-fs：未打 asar 补丁的原始 node:fs。
 * Electron 官方类型未覆盖此模块，删除真实 .asar 文件（绕过 asar 虚拟文件系统）时使用。
 */
declare module 'original-fs' {
  import type * as nodeFs from 'node:fs'

  const originalFs: typeof nodeFs
  export default originalFs
}
