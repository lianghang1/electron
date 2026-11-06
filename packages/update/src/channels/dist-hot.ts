import type { UpdateChannel, UpdatePlan, VersionMatrix } from '../update-center'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { extract } from 'extract-zip'
import { downloadFile, verifySha256 } from '../net'

/**
 * dist-hot 通道：应用 dist 资源热更（免重启）。
 * 场景：packaged 形态应用的前端产物迭代——下载 zip → sha256 校验 →
 * staging 解压 → 原子 rename 换掉 resources/apps/<appId> → 立即生效
 * （app:// 协议直读文件系统，下次进入该应用即是新版本）。
 *
 * 中断安全：全程工作在 staging 目录；rename 是最后一步且原子。
 */
export interface DistHotOptions {
  /** 应用 dist 根目录（与 PackagedOpener.appsRoot 同源） */
  appsRoot: string
  /** 更新清单（含各 app 的 zip 地址与 sha256） */
  manifestUrl: string
  allowedOrigins: string[]
}

interface DistManifest {
  apps: Record<string, { version: string, url: string, sha256: string }>
}

export class DistHotChannel implements UpdateChannel {
  readonly id = 'dist-hot' as const

  constructor(private readonly options: DistHotOptions) {}

  async check(current: VersionMatrix): Promise<UpdatePlan | null> {
    const manifest = await this.fetchManifest()
    for (const [appId, entry] of Object.entries(manifest.apps)) {
      if ((current.apps[appId] ?? '0.0.0') < entry.version) {
        return {
          channel: this.id,
          targetVersion: entry.version,
          downloadUrl: entry.url,
          // 扩展载荷：appId 与校验值随 plan 传递（SPI 契约外的通道自有字段）
          ...({ appId, sha256: entry.sha256 } as object),
        } as UpdatePlan
      }
    }
    return null
  }

  async apply(plan: UpdatePlan): Promise<{ ok: boolean, requiresRestart: boolean, error?: string }> {
    const meta = plan as UpdatePlan & { appId?: string, sha256?: string }
    if (!meta.appId || !meta.sha256)
      return { ok: false, requiresRestart: false, error: 'dist-hot plan missing appId/sha256' }

    const staging = join(this.options.appsRoot, `.staging-${meta.appId}`)
    const target = join(this.options.appsRoot, meta.appId)
    try {
      const zipPath = `${staging}.zip`
      await downloadFile(plan.downloadUrl, zipPath)
      verifySha256(zipPath, meta.sha256)

      rmSync(staging, { recursive: true, force: true })
      await extract(zipPath, { dir: staging })
      rmSync(zipPath, { force: true })

      // 原子切换：旧目录先改名保留（.bak），新目录就位后删除——中途断电旧版本仍在
      const backup = join(this.options.appsRoot, `.bak-${meta.appId}`)
      if (existsSync(backup))
        rmSync(backup, { recursive: true, force: true })
      if (existsSync(target))
        renameSync(target, backup)
      renameSync(staging, target)
      if (existsSync(backup))
        rmSync(backup, { recursive: true, force: true })
      return { ok: true, requiresRestart: false }
    }
    catch (err) {
      rmSync(staging, { recursive: true, force: true })
      return { ok: false, requiresRestart: false, error: String(err) }
    }
  }

  private async fetchManifest(): Promise<DistManifest> {
    const res = await fetch(this.options.manifestUrl)
    if (!res.ok)
      throw new Error(`manifest fetch failed: ${res.status}`)
    return res.json() as Promise<DistManifest>
  }
}
