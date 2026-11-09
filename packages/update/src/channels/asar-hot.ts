import type { UpdateChannel, UpdatePlan, VersionMatrix } from '../update-center'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { isNewer } from '@shell/shared'
import { applyBundle } from '../boot/bundle'
import { clearOrphanCores, hasPending, readCurrent, updaterDir, writePending } from '../boot/pointer'
import { assertAllowedUrl, fetchUpdateManifest } from '../manifest'
import { downloadFile, verifySha256 } from '../net'

/**
 * asar-hot 通道：主进程代码热更（源码依据 master AsarUpdateService + bundle.ts）。
 * 运行中绝不替换 app.asar：下载 zip → 包内 update.json 自描述 + sha256 强校验 →
 * 版本化终名 core-<version>.asar 落 userData → 写 pending.json → 重启由引导层切 current 指针。
 * 首启 60s 判活失败由引导层回滚内置包；加载失败同样自动回退内置包。
 */
export interface AsarHotOptions {
  manifestUrl: string
  allowedOrigins: string[]
  /** 本机 resources 版本（after-pack 标记），用于包内 minResourcesVersion 配对门槛 */
  resourcesVersion?: string | null
}

const BUNDLE_NAME = 'pending-bundle.zip'

export class AsarHotChannel implements UpdateChannel {
  readonly id = 'asar-hot' as const

  constructor(private readonly options: AsarHotOptions) {}

  async check(current: VersionMatrix): Promise<UpdatePlan | null> {
    const manifest = await fetchUpdateManifest(this.options.manifestUrl, this.options.allowedOrigins)
    if (!manifest.asar) { return null }
    if (isNewer(manifest.asar.version, current.asar ?? '0.0.0')) {
      return {
        channel: this.id,
        targetVersion: manifest.asar.version,
        downloadUrl: manifest.asar.url,
        payload: { sha256: manifest.asar.sha256 },
      }
    }
    return null
  }

  async apply(plan: UpdatePlan, signal?: AbortSignal): Promise<{ ok: boolean, requiresRestart: boolean, error?: string }> {
    const dir = updaterDir()
    const zipPath = join(dir, BUNDLE_NAME)
    try {
      assertAllowedUrl(plan.downloadUrl, this.options.allowedOrigins)
      mkdirSync(dir, { recursive: true })
      await downloadFile(plan.downloadUrl, zipPath, {}, signal)
      if (plan.payload?.sha256) { await verifySha256(zipPath, plan.payload.sha256) }
      const outcome = await applyBundle({
        zipPath,
        externalVersion: plan.targetVersion,
        targetDir: dir,
        resourcesVersion: this.options.resourcesVersion ?? null,
      })
      if (outcome.status === 'blocked') {
        return { ok: false, requiresRestart: true, error: `resources too old, requires ${outcome.minResourcesVersion}` }
      }
      const keep = [outcome.pending.file, readCurrent()?.file].filter((f): f is string => Boolean(f))
      clearOrphanCores(keep)
      writePending(outcome.pending)
      return { ok: true, requiresRestart: true }
    }
    catch (err) {
      rmSync(zipPath, { force: true })
      rmSync(`${zipPath}.d`, { recursive: true, force: true })
      return { ok: false, requiresRestart: true, error: String(err) }
    }
  }
}

/** 定时重启择优：pending 指针存在且包文件未丢失才算有待生效热更 */
export function hasPendingAsarUpdate(): boolean {
  return hasPending()
}

export function currentHotVersion(): string | null {
  return readCurrent()?.version ?? null
}
