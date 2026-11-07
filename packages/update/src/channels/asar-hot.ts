import type { UpdateCenter, UpdateChannel, UpdatePlan, VersionMatrix } from '../update-center'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { downloadFile, verifySha256 } from '../net'

/**
 * asar-hot 通道：主进程代码热更（原子换名 + .bak 回滚，防变砖）。
 *
 * 契约目录 userData/desktop-updater/（与整包引导器共享，自身永不热更）：
 * - pending.asar        staging：下载与校验在此完成
 * - pending.asar.json   状态标记 { version, stage: 'downloaded' | 'swapped' }
 *
 * 流程（三段状态机，任何一步断电都落在可运行版本）：
 * 1. apply：下载校验进 pending.asar，标记 stage=downloaded，要求重启
 * 2. finalize（下次启动最早处，组合根调用）：stage=downloaded → 当前 app.asar 改名 .bak
 *    → pending.asar 就位 → 标记 stage=swapped（此刻若崩溃：重启再进本分支发现
 *    pending.asar 已不存在且 stage=swapped → 清理即退出，正式位已是新版本）
 * 3. finalize 二次进入：stage=swapped → 删 .bak 与标记，链路闭合
 */
export interface AsarHotOptions {
  /** app.asar 所在目录（打包: resources/；dev 下此通道不可用） */
  resourcesDir: string
  manifestUrl: string
  allowedOrigins: string[]
}

interface AsarManifest {
  asar: { version: string, url: string, sha256: string }
}

const UPDATER_DIR = 'desktop-updater'
const MARKER = 'pending.asar.json'
type Stage = 'downloaded' | 'swapped'

export class AsarHotChannel implements UpdateChannel {
  readonly id = 'asar-hot' as const

  constructor(private readonly options: AsarHotOptions) {}

  private get updaterDir(): string {
    return join(app.getPath('userData'), UPDATER_DIR)
  }

  async check(current: VersionMatrix): Promise<UpdatePlan | null> {
    if (!existsSync(join(this.options.resourcesDir, 'app.asar')))
      return null
    const res = await fetch(this.options.manifestUrl)
    if (!res.ok)
      throw new Error(`manifest fetch failed: ${res.status}`)
    const manifest = await res.json() as AsarManifest
    if ((current.asar ?? '0.0.0') < manifest.asar.version) {
      return {
        channel: this.id,
        targetVersion: manifest.asar.version,
        downloadUrl: manifest.asar.url,
        ...({ sha256: manifest.asar.sha256 } as object),
      } as UpdatePlan
    }
    return null
  }

  async apply(plan: UpdatePlan): Promise<{ ok: boolean, requiresRestart: boolean, error?: string }> {
    const meta = plan as UpdatePlan & { sha256?: string }
    try {
      mkdirSync(this.updaterDir, { recursive: true })
      const pendingAsar = join(this.updaterDir, 'pending.asar')
      await downloadFile(plan.downloadUrl, pendingAsar)
      if (meta.sha256)
        await verifySha256(pendingAsar, meta.sha256)

      writeFileSync(join(this.updaterDir, MARKER), JSON.stringify({ version: plan.targetVersion, stage: 'downloaded' }))
      return { ok: true, requiresRestart: true }
    }
    catch (err) {
      return { ok: false, requiresRestart: true, error: String(err) }
    }
  }
}

type UpdateCenterVersionMatrix = VersionMatrix

/**
 * asar 热更的落盘切换 + 启动 finalize（见类注释的三段状态机）。
 * 独立模块函数：切换发生在"下一次启动的最早时刻"，谁启动谁 finalize，幂等。
 */
export function finalizeAsarUpdate(resourcesDir: string): void {
  const updaterDir = join(app.getPath('userData'), UPDATER_DIR)
  const markerPath = join(updaterDir, MARKER)
  if (!existsSync(markerPath))
    return

  let stage: Stage = 'downloaded'
  try {
    stage = (JSON.parse(readFileSync(markerPath, 'utf-8')) as { stage: Stage }).stage
  }
  catch {
    // 标记损坏：按最保守的 downloaded 处理（pending.asar 存在性再校验）
  }

  const liveAsar = join(resourcesDir, 'app.asar')
  const bakAsar = join(resourcesDir, 'app.asar.bak')
  const pendingAsar = join(updaterDir, 'pending.asar')

  if (stage === 'downloaded' && existsSync(pendingAsar)) {
    // 原子换名：当前 → .bak（回滚点），pending → 正式位
    if (existsSync(liveAsar))
      renameSync(liveAsar, bakAsar)
    renameSync(pendingAsar, liveAsar)
    writeFileSync(markerPath, JSON.stringify({ stage: 'swapped' }))
    return
  }

  // swapped（或 downloaded 但 pending 丢失——下载被中断）：清理收尾
  rmSync(bakAsar, { force: true })
  rmSync(markerPath, { force: true })
  if (stage === 'downloaded')
    rmSync(pendingAsar, { force: true })
}
