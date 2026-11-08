import type { UpdateChannel, UpdatePlan, VersionMatrix } from '../update-center'
import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { assertAllowedUrl, fetchUpdateManifest } from '../manifest'
import { downloadFile, verifySha256 } from '../net'

/**
 * full-package 通道：整包更新（下载安装器 → 校验 → 退出前拉起静默安装）。
 * Kiosk 场景配合 settings 的 kioskSilentUpdate：锁屏时段执行，安装器静默参数。
 * 中断安全：安装器下载在独立文件 + sha256 校验，失败不影响当前版本运行。
 */
export interface FullPackageOptions {
  manifestUrl: string
  allowedOrigins: string[]
  /** kiosk 静默安装时段（如 '02:30'）；未配置 = 提示用户手动安装 */
  silentInstallAt?: string
}

let scheduled: { installerPath: string, args: string } | null = null

export class FullPackageChannel implements UpdateChannel {
  readonly id = 'full-package' as const

  constructor(private readonly options: FullPackageOptions) {}

  async check(current: VersionMatrix): Promise<UpdatePlan | null> {
    const manifest = await fetchUpdateManifest(this.options.manifestUrl, this.options.allowedOrigins)
    if (!manifest.package) { return null }
    if (current.shell < manifest.package.version) {
      return {
        channel: this.id,
        targetVersion: manifest.package.version,
        downloadUrl: manifest.package.url,
        payload: { sha256: manifest.package.sha256, silentArgs: manifest.package.silentArgs },
      }
    }
    return null
  }

  async apply(plan: UpdatePlan): Promise<{ ok: boolean, requiresRestart: boolean, error?: string }> {
    const installerPath = join(app.getPath('userData'), 'desktop-updater', 'pending-installer.exe')
    try {
      assertAllowedUrl(plan.downloadUrl, this.options.allowedOrigins)
      await downloadFile(plan.downloadUrl, installerPath)
      if (plan.payload?.sha256) { await verifySha256(installerPath, plan.payload.sha256) }

      // 安排退出后安装：before-quit 时由 installScheduled() 拉起分离进程
      scheduled = { installerPath, args: plan.payload?.silentArgs ?? '/S' }
      return { ok: true, requiresRestart: true }
    }
    catch (err) {
      scheduled = null
      rmSync(installerPath, { force: true })
      return { ok: false, requiresRestart: true, error: String(err) }
    }
  }
}

/** 组合根在退出流程调用：有排程则拉起分离的安装进程再退出 */
export function installScheduled(): void {
  if (!scheduled) { return }
  const child = spawn(scheduled.installerPath, scheduled.args.split(' '), {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  scheduled = null
}
