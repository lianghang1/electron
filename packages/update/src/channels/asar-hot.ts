import type { UpdateChannel, UpdatePlan, VersionMatrix } from '../update-center'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { assertAllowedUrl, fetchUpdateManifest } from '../manifest'
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
    if (!existsSync(join(this.options.resourcesDir, 'app.asar'))) { return null }
    const manifest = await fetchUpdateManifest(this.options.manifestUrl, this.options.allowedOrigins)
    if (!manifest.asar) { return null }
    if ((current.asar ?? '0.0.0') < manifest.asar.version) {
      return {
        channel: this.id,
        targetVersion: manifest.asar.version,
        downloadUrl: manifest.asar.url,
        payload: { sha256: manifest.asar.sha256 },
      }
    }
    return null
  }

  async apply(plan: UpdatePlan): Promise<{ ok: boolean, requiresRestart: boolean, error?: string }> {
    try {
      assertAllowedUrl(plan.downloadUrl, this.options.allowedOrigins)
      mkdirSync(this.updaterDir, { recursive: true })
      const pendingAsar = join(this.updaterDir, 'pending.asar')
      await downloadFile(plan.downloadUrl, pendingAsar)
      if (plan.payload?.sha256) { await verifySha256(pendingAsar, plan.payload.sha256) }

      writeFileSync(join(this.updaterDir, MARKER), JSON.stringify({ version: plan.targetVersion, stage: 'downloaded' }))
      return { ok: true, requiresRestart: true }
    }
    catch (err) {
      // 校验失败必须删掉坏 pending.asar：否则下次下载按 Range 续传会拼出损坏文件
      rmSync(join(this.updaterDir, 'pending.asar'), { force: true })
      return { ok: false, requiresRestart: true, error: String(err) }
    }
  }
}

/**
 * asar 热更的落盘切换 + 启动 finalize（见类注释的三段状态机）。
 * 独立模块函数：切换发生在"下一次启动的最早时刻"，谁启动谁 finalize，幂等。
 * 返回结构而非抛错：Windows 上 app.asar 被占用会让 rename 失败，启动绝不能被更新拖垮。
 */
export interface FinalizeResult {
  ok: boolean
  error?: string
}

export function finalizeAsarUpdate(resourcesDir: string): FinalizeResult {
  const updaterDir = join(app.getPath('userData'), UPDATER_DIR)
  const markerPath = join(updaterDir, MARKER)
  if (!existsSync(markerPath)) { return { ok: true } }

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

  try {
    if (stage === 'downloaded' && existsSync(pendingAsar)) {
      // 原子换名：当前 → .bak（回滚点），pending → 正式位
      if (existsSync(liveAsar)) { renameSync(liveAsar, bakAsar) }
      renameSync(pendingAsar, liveAsar)
      writeFileSync(markerPath, JSON.stringify({ stage: 'swapped' }))
      return { ok: true }
    }

    // swapped（或 downloaded 但 pending 丢失——下载被中断）：清理收尾
    rmSync(bakAsar, { force: true })
    rmSync(markerPath, { force: true })
    if (stage === 'downloaded') { rmSync(pendingAsar, { force: true }) }
    return { ok: true }
  }
  catch (err) {
    // 正式位可能已让给 .bak：必须恢复，否则下次启动无版本可跑。
    // downloaded 标记与 pending.asar 都不动，下次启动重试（Windows 文件锁释放后自然成功）。
    let detail = String(err)
    if (!existsSync(liveAsar) && existsSync(bakAsar)) {
      try { renameSync(bakAsar, liveAsar) }
      catch { detail += '; .bak 回滚也失败，需人工介入' }
    }
    return { ok: false, error: detail }
  }
}
