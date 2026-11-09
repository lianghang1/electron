import type { InstallCommand, PackageInstaller } from './contract'
import { resolveCommand } from './contract'

/** NSIS：/S 为静默参数，--updated 触发 electron-builder KeepShortcuts（保留用户已删/已固定的快捷方式） */
export class Win32Installer implements PackageInstaller {
  readonly platform = 'win32' as const

  stagingName(): string {
    return 'pending-installer.exe'
  }

  async prepare(localPath: string): Promise<InstallCommand> {
    return resolveCommand(['{path}', '/S', '--updated'], localPath)
  }
}
