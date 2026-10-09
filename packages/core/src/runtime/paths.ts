import path from 'node:path'
import process from 'node:process'
import { app } from 'electron'

/**
 * 主进程统一的 asar 外资源定位（DLL / 外置 exe 等需以真实文件存在的资源）。
 * 所有设备模块共用，禁止再各自拼 resourcesPath / getAppPath。
 *
 * 相对路径以应用为基准原样拼接：
 *   开发: <应用根>/<file>         如 resources/devices/huashi/Termb.dll
 *   打包: <resourcesPath>/<file>  需 extraResources: { from: 'resources', to: 'resources' }
 */
export function resolveResourcePath(file: string): string {
  if (path.isAbsolute(file)) {
    return file
  }
  return path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), file)
}
