import type { UpdateChannel, UpdatePlan, VersionMatrix } from '../update-center'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { app } from 'electron'
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

interface FullManifest {
  package: { version: string, url: string, sha256: string, silentArgs: string }
}

let scheduled: { installerPath: string, args: string } | null = null

export class FullPackageChannel implements UpdateChannel {
  readonly id = 'full-package' as const

  constructor(private readonly options: FullPackageOptions) {}

  async check(current: VersionMatrix): Promise<UpdatePlan | null> {
    const res = await fetch(this.options.manifestUrl)
    if (!res.ok)
      throw new Error(`manifest fetch failed: ${res.status}`)
    const manifest = await res.json() as FullManifest
    if (current.shell < manifest.package.version) {
      return {
        channel: this.id,
        targetVersion: manifest.package.version,
        downloadUrl: manifest.package.url,
        ...({ sha256: manifest.package.sha256, silentArgs: manifest.package.silentArgs } as object),
      } as UpdatePlan
    }
    return null
  }

  async apply(plan: UpdatePlan): Promise<{ ok: boolean, requiresRestart: boolean, error?: string }> {
    const meta = plan as UpdatePlan & { sha256?: string, silentArgs?: string }
    try {
      const installerPath = join(app.getPath('userData'), 'desktop-updater', 'pending-installer.exe')
      await downloadFile(plan.downloadUrl, installerPath)
      if (meta.sha256)
        verifySha256(installerPath, meta.sha256)

      // 安排退出后安装：before-quit 时由 installScheduled() 拉起分离进程
      scheduled = { installerPath, args: meta.silentArgs ?? '/S' }
      return { ok: true, requiresRestart: true }
    }
    catch (err) {
      scheduled = null
      return { ok: false, requiresRestart: true, error: String(err) }
    }
  }
}

/** 组合根在退出流程调用：有排程则拉起分离的安装进程再退出 */
export function installScheduled(): void {
  if (!scheduled)
    return
  const child = spawn(scheduled.installerPath, scheduled.args.split(' '), {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  scheduled = null
}
