import type { InstallCommand, PackageArtifact, PackageInstaller } from './contract'
import { chmod } from 'node:fs/promises'
import { resolveCommand } from './contract'

/**
 * Linux：deb 走 pkexec + dpkg（polkit 提权）；AppImage 等由清单下发 command 模板决定落地方式
 * （自更新需替换 $APPIMAGE，现场差异不写死在平台代码里）。
 */
export class LinuxInstaller implements PackageInstaller {
  readonly platform = 'linux' as const

  stagingName(artifact: PackageArtifact): string {
    const ext = new URL(artifact.url).pathname.match(/\.(deb|AppImage|rpm|bin)$/)?.[1] ?? 'bin'
    return `pending-installer.${ext}`
  }

  async prepare(localPath: string, artifact: PackageArtifact): Promise<InstallCommand> {
    await chmod(localPath, 0o755)
    const template = artifact.command ?? (localPath.endsWith('.deb')
      ? ['pkexec', 'dpkg', '-i', '{path}']
      : ['{path}'])
    return resolveCommand(template, localPath)
  }
}
