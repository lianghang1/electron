import { spawn } from 'node:child_process'

/**
 * 构建目标平台：Electron 官方三种产物平台。
 * 与 shared/capability.ts 的 Platform（硬件能力平台，含国产化细分）不是同一维度，勿混用。
 */
export type BuildPlatform = 'win32' | 'darwin' | 'linux'

/** 整包条目；command 模板可覆盖平台默认落地命令，{path} 替换为校验后的本地路径 */
export interface PackageArtifact {
  url: string
  sha256: string
  command?: string[]
}

/** 平台无关的安装命令描述：策略只负责产出，退出时统一拉起 */
export interface InstallCommand {
  command: string
  args: string[]
  detached: boolean
}

/**
 * 整包落地 SPI：文件形态、提权、挂载、静默参数全部收敛到各实现。
 * 实例由组合根按平台查表唯一创建并注入 FullPackageChannel，通道内零分支。
 */
export interface PackageInstaller {
  readonly platform: BuildPlatform
  /** 暂存文件名：Windows 需 .exe 才能 CreateProcess；Linux 保留包后缀供包管理器识别 */
  stagingName: (artifact: PackageArtifact) => string
  /** 校验通过后的准备动作（chmod 等）→ 安装命令 */
  prepare: (localPath: string, artifact: PackageArtifact) => Promise<InstallCommand>
}

export function resolveCommand(template: string[], localPath: string): InstallCommand {
  if (template.length === 0) { throw new Error('install command template is empty') }
  const [command, ...args] = template.map(part => part.replaceAll('{path}', localPath))
  return { command, args, detached: true }
}

/** 退出后脱离父进程继续安装；error 必须挂监听，否则异步 ENOENT 会掀翻退出流程 */
export function launchInstall(spec: InstallCommand, onError?: (err: Error) => void): void {
  const child = spawn(spec.command, spec.args, { detached: spec.detached, stdio: 'ignore' })
  child.on('error', err => onError?.(err))
  if (spec.detached) { child.unref() }
}
