import type { InstallCommand, PackageArtifact, PackageInstaller } from './contract'
import { chmod } from 'node:fs/promises'
import { resolveCommand } from './contract'

/**
 * Linux：deb 走 pkexec + dpkg（polkit 提权）。
 * AppImage 自更新需把校验后的包替换到运行中的目标路径——该目标由组合根从本地环境
 * ($APPIMAGE) 注入，不来自服务端清单：清单能带命令就等于能远程执行任意程序。
 * 未注入目标时 AppImage 退化为直接运行（现场可自行处理），命令模板一律内建。
 */
export interface LinuxInstallerOptions {
  /** AppImage 替换目标（本地可信路径），缺省不替换 */
  appImageTarget?: string
}

export class LinuxInstaller implements PackageInstaller {
  readonly platform = 'linux' as const

  constructor(private readonly options: LinuxInstallerOptions = {}) {}

  stagingName(artifact: PackageArtifact): string {
    const ext = new URL(artifact.url).pathname.match(/\.(deb|AppImage|rpm|bin)$/)?.[1] ?? 'bin'
    return `pending-installer.${ext}`
  }

  async prepare(localPath: string): Promise<InstallCommand> {
    await chmod(localPath, 0o755)
    if (localPath.endsWith('.deb')) {
      return resolveCommand(['pkexec', 'dpkg', '-i', '{path}'], localPath)
    }
    if (localPath.endsWith('.AppImage') && this.options.appImageTarget) {
      return resolveCommand(['cp', '{path}', this.options.appImageTarget], localPath)
    }
    return resolveCommand(['{path}'], localPath)
  }
}
