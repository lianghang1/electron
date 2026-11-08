import type { InstallCommand, PackageArtifact, PackageInstaller } from './contract'
import { resolveCommand } from './contract'

/** macOS：默认交 Finder 打开 dmg；静默部署由清单下发 command 模板（hdiutil attach + ditto 到 /Applications） */
export class DarwinInstaller implements PackageInstaller {
  readonly platform = 'darwin' as const

  stagingName(): string {
    return 'pending-installer.dmg'
  }

  async prepare(localPath: string, artifact: PackageArtifact): Promise<InstallCommand> {
    return resolveCommand(artifact.command ?? ['open', '{path}'], localPath)
  }
}
