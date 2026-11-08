import type { InstallCommand, PackageInstaller } from './contract'
import { resolveCommand } from './contract'

/** NSIS：/S 为 electron-builder nsis 契约的静默参数；perMachine 安装需管理员权限 */
export class Win32Installer implements PackageInstaller {
  readonly platform = 'win32' as const

  stagingName(): string {
    return 'pending-installer.exe'
  }

  async prepare(localPath: string): Promise<InstallCommand> {
    return resolveCommand(['{path}', '/S'], localPath)
  }
}
