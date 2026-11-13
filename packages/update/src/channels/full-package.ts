import type { InstallCommand, PackageArtifact, PackageInstaller } from '../installers/contract'
import type { UpdateChannel, UpdatePlan, VersionMatrix } from '../update-center'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { isNewer } from '@shell/shared'
import { app } from 'electron'
import { launchInstall } from '../installers/contract'
import { assertAllowedUrl, fetchUpdateManifest } from '../manifest'
import { downloadFile, verifySha256 } from '../net'

/**
 * full-package 通道：整包更新（下载 → 校验 → 平台策略准备 → 退出前拉起安装）。
 * 平台差异全在注入的 PackageInstaller 里，本通道零分支；排程是实例状态，不是模块全局。
 * 中断安全：下载与校验都在暂存文件，失败即清理，不影响当前版本运行。
 */
export interface FullPackageOptions {
  manifestUrl: string
  allowedOrigins: string[]
  /** 组合根按构建平台查表创建并注入 */
  installer: PackageInstaller
}

export class FullPackageChannel implements UpdateChannel {
  readonly id = 'full-package' as const
  private pending: InstallCommand | null = null

  constructor(private readonly options: FullPackageOptions) {}

  /** 整包已下载校验并排程安装，等待退出时机落地 */
  get hasPendingInstall(): boolean {
    return this.pending !== null
  }

  async check(current: VersionMatrix): Promise<UpdatePlan | null> {
    const manifest = await fetchUpdateManifest(this.options.manifestUrl, this.options.allowedOrigins)
    const pkg = manifest.package
    if (!pkg || !isNewer(pkg.version, current.shell)) { return null }
    const artifact = pkg.artifacts[this.options.installer.platform]
    if (!artifact) { return null }
    assertAllowedUrl(artifact.url, this.options.allowedOrigins)
    return {
      channel: this.id,
      targetVersion: pkg.version,
      downloadUrl: artifact.url,
      payload: { sha256: artifact.sha256 },
    }
  }

  async apply(plan: UpdatePlan, signal?: AbortSignal): Promise<{ ok: boolean, requiresRestart: boolean, error?: string }> {
    const artifact: PackageArtifact = {
      url: plan.downloadUrl,
      sha256: plan.payload?.sha256 ?? '',
    }
    const staging = join(app.getPath('userData'), 'updater', this.options.installer.stagingName(artifact))
    this.pending = null
    try {
      assertAllowedUrl(plan.downloadUrl, this.options.allowedOrigins)
      await downloadFile(plan.downloadUrl, staging, {}, signal)
      await verifySha256(staging, artifact.sha256)
      this.pending = await this.options.installer.prepare(staging, artifact)
      return { ok: true, requiresRestart: true }
    }
    catch (err) {
      this.pending = null
      rmSync(staging, { force: true })
      return { ok: false, requiresRestart: true, error: String(err) }
    }
  }

  /** 组合根 before-quit 驱动：有排程才拉起，且只拉起一次 */
  installOnQuit(onError?: (err: Error) => void): boolean {
    if (!this.pending) { return false }
    const spec = this.pending
    this.pending = null
    launchInstall(spec, onError)
    return true
  }
}
