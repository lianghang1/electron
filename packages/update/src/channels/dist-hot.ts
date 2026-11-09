import type { UpdateChannel, UpdatePlan, VersionMatrix } from '../update-center'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { assertSafeSegment, isNewer } from '@shell/shared'
import extract from 'extract-zip'
import { hotAppsDir, readAppsPointer, writeAppsPointer } from '../boot/pointer'
import { assertAllowedUrl, fetchUpdateManifest } from '../manifest'
import { downloadFile, verifySha256 } from '../net'

/**
 * dist-hot 通道：应用 dist 资源热更（免重启）。
 * 源码依据 master bundle.ts 的版本化终名思想：产物落 userData 而非安装目录，
 * 避免 Program Files / mac 签名 seal / 国产化不可变系统下不可写或破坏签名；
 * apps-current.json 是指针，app:// 协议按 appId 查指针取目录，读写同源。
 */
export interface DistHotOptions {
  manifestUrl: string
  allowedOrigins: string[]
}

function safeVersion(version: string): string {
  return version.replace(/[^\w.-]/g, '_')
}

export class DistHotChannel implements UpdateChannel {
  readonly id = 'dist-hot' as const

  constructor(private readonly options: DistHotOptions) {}

  async check(current: VersionMatrix): Promise<UpdatePlan | null> {
    const manifest = await fetchUpdateManifest(this.options.manifestUrl, this.options.allowedOrigins)
    if (!manifest.apps) { return null }
    for (const [appId, entry] of Object.entries(manifest.apps)) {
      assertSafeSegment(appId, 'appId')
      if (isNewer(entry.version, current.apps[appId] ?? '0.0.0')) {
        return {
          channel: this.id,
          targetVersion: entry.version,
          downloadUrl: entry.url,
          payload: { appId, sha256: entry.sha256 },
        }
      }
    }
    return null
  }

  async apply(plan: UpdatePlan, signal?: AbortSignal): Promise<{ ok: boolean, requiresRestart: boolean, error?: string }> {
    const { appId, sha256 } = plan.payload ?? {}
    if (!appId || !sha256) { return { ok: false, requiresRestart: false, error: 'dist-hot plan missing appId/sha256' } }
    try {
      assertSafeSegment(appId, 'appId')
      assertAllowedUrl(plan.downloadUrl, this.options.allowedOrigins)
    }
    catch (err) {
      return { ok: false, requiresRestart: false, error: String(err) }
    }

    const dir = hotAppsDir()
    const suffix = `${appId}-${safeVersion(plan.targetVersion)}`
    const versionDir = join(dir, suffix)
    const staging = join(dir, `.staging-${suffix}`)
    const backup = join(dir, `.old-${suffix}`)
    const zipPath = join(dir, `.staging-${suffix}.zip`)
    mkdirSync(dir, { recursive: true })
    try {
      await downloadFile(plan.downloadUrl, zipPath, {}, signal)
      await verifySha256(zipPath, sha256)
      rmSync(staging, { recursive: true, force: true })
      await extract(zipPath, { dir: staging })

      // 原子换名：生效目录先让位到 .old，staging 就位后删旧。
      // 断电落在任一状态都有可运行版本（.old 或新目录），指针始终指向 versionDir。
      rmSync(backup, { recursive: true, force: true })
      if (existsSync(versionDir)) { renameSync(versionDir, backup) }
      renameSync(staging, versionDir)

      const pointer = readAppsPointer()
      pointer[appId] = { version: plan.targetVersion, dir: versionDir }
      writeAppsPointer(pointer)
      rmSync(backup, { recursive: true, force: true })
      clearOrphanAppDirs(dir, appId, versionDir)
      return { ok: true, requiresRestart: false }
    }
    catch (err) {
      rmSync(staging, { recursive: true, force: true })
      if (!existsSync(versionDir) && existsSync(backup)) { renameSync(backup, versionDir) }
      return { ok: false, requiresRestart: false, error: String(err) }
    }
    finally {
      rmSync(zipPath, { force: true })
    }
  }
}

/** 下载即清孤儿：只保留该应用生效指针指向的目录 */
function clearOrphanAppDirs(dir: string, appId: string, keep: string): void {
  if (!existsSync(dir)) { return }
  for (const name of readdirSync(dir)) {
    if (!name.startsWith(`${appId}-`) || join(dir, name) === keep) { continue }
    try { rmSync(join(dir, name), { recursive: true, force: true }) }
    catch { /* 清理失败不阻塞热更链路 */ }
  }
}
