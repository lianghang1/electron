import type { AsarBundleManifest } from '@desktop/shared'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import AdmZip from 'adm-zip'
import { app } from 'electron'
import originalFs from 'original-fs'
import { compareVersions } from './version'

/** asar 热更工作目录（userData 下，用户可写，与安装位置权限无关） */
export function getAsarUpdateDir(): string {
  return path.join(app.getPath('userData'), 'desktop-updater')
}

/** pending 标记（存在 = 已下载校验通过，等待引导器替换） */
export function getPendingMarkPath(): string {
  return path.join(getAsarUpdateDir(), 'pending.json')
}

/** pending 标记负载（AsarUpdateService 写入，引导器消费） */
export interface PendingMark {
  version: string
  file: string
  sha256: string
}

/** current 指针（引导器 applyPending 写入） */
export interface CurrentMark {
  version: string
  file: string
  appliedAt: number
}

/** 热更包文件名：版本化命名，下载即终名，引导器永不 rename */
export function asarFileName(version: string): string {
  return `core-${version.replace(/[^\w.-]/g, '_')}.asar`
}

/** 包校验结果：ready = 校验通过待生效；blocked = minResourcesVersion 门槛未满足（等待整包更新先行） */
export type ApplyBundleResult
  = | { status: 'ready', pending: PendingMark }
    | { status: 'blocked', minResourcesVersion: string }

/** Electron 把 *.asar 路径代理为 asar 虚拟文件系统（fs.rm 按目录处理报 EISDIR），删除真实 asar 必须绕过补丁 */
export function rmAsar(target: string, options: { recursive?: boolean } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    originalFs.rm(target, { force: true, ...options }, (error: Error | null) => (error ? reject(error) : resolve()))
  })
}

/** 本机 resources 版本标记（afterPack 写入；dev 环境 / 无标记的旧安装返回 null = 不设限） */
function readResourcesVersion(): string | null {
  try {
    const marker = path.join(process.resourcesPath, 'resources', '.resources-version')
    return existsSync(marker) ? readFileSync(marker, 'utf8').trim() : null
  }
  catch {
    return null
  }
}

/**
 * 热更包自描述校验（协议：zip 内含 update.json + asar，校验元数据随包下发）：
 * 解析 update.json → 外部清单版本一致性 → minResourcesVersion 资源配对门槛 →
 * 解出清单声明的 asar 条目（zip-slip 防护：只取条目内容写入固定路径，不做路径解压）
 * → sha256 强校验。校验通过：asar 以版本化终名落盘、删除 zip，返回 ready；
 * 资源配对不满足：清理 zip 返回 blocked（跳过，等待整包更新先行）；其余失败清理后抛错。
 * zip/asar 读写走 originalFs 绕过 asar 补丁（.asar 后缀文件的 fs 操作会被劫持为归档解析）。
 */
export async function applyBundle(zipPath: string, externalVersion: string): Promise<ApplyBundleResult> {
  let zip: AdmZip
  try {
    zip = new AdmZip(originalFs.readFileSync(zipPath))
  }
  catch (error) {
    await rmAsar(zipPath)
    throw new Error(`asar bundle is not a valid zip: ${String(error)}`)
  }

  try {
    const bundle = parseBundleManifest(zip, externalVersion)
    // 资源配对：热更只换代码，热更代码依赖新版 resources（厂商 DLL/内置页面）而本机
    // resources 旧于要求时拒绝应用（元数据随包下发，故在下载后判断），等待整包更新先行
    if (bundle.minResourcesVersion) {
      const localResources = readResourcesVersion()
      if (localResources && compareVersions(bundle.minResourcesVersion, localResources) > 0) {
        return { status: 'blocked', minResourcesVersion: bundle.minResourcesVersion }
      }
    }

    const entry = zip.getEntry(bundle.file)
    if (!entry || entry.isDirectory) { throw new Error(`asar bundle entry not found: ${bundle.file}`) }
    const asarBytes = entry.getData()
    const actual = createHash('sha256').update(asarBytes).digest('hex')
    if (actual !== bundle.sha256.toLowerCase()) { throw new Error(`asar checksum mismatch: expected ${bundle.sha256}, got ${actual}`) }

    const asarPath = path.join(path.dirname(zipPath), asarFileName(bundle.version))
    originalFs.writeFileSync(asarPath, asarBytes)
    return { status: 'ready', pending: { version: bundle.version, file: asarFileName(bundle.version), sha256: bundle.sha256 } }
  }
  finally {
    // 成功（asar 已落盘）、blocked 与失败均清理 zip 容器
    await rmAsar(zipPath)
  }
}

/** 解析包内 update.json：字段完整性 + 与外部清单的版本一致性 */
function parseBundleManifest(zip: AdmZip, externalVersion: string): AsarBundleManifest {
  const metaEntry = zip.getEntry('update.json')
  if (!metaEntry || metaEntry.isDirectory) { throw new Error('asar bundle missing update.json') }
  let bundle: AsarBundleManifest
  try {
    bundle = JSON.parse(metaEntry.getData().toString('utf8')) as AsarBundleManifest
  }
  catch (error) {
    throw new Error(`asar bundle update.json invalid: ${String(error)}`)
  }
  if (!bundle?.version || !bundle.file || !bundle.sha256) { throw new Error('asar bundle update.json missing required fields (version/file/sha256)') }
  if (bundle.version !== externalVersion) { throw new Error(`asar bundle version mismatch: external ${externalVersion}, bundle ${bundle.version}`) }
  return bundle
}

/** 下载即清孤儿：删除热更目录中非生效、非本次待生效的 core-*.asar（原等引导器 settle 才清） */
export async function clearOrphanAsars(dir: string, keepFiles: string[]): Promise<void> {
  try {
    for (const name of await readdir(dir)) {
      if (!name.startsWith('core-') || !name.endsWith('.asar')) { continue }
      if (keepFiles.includes(name)) { continue }
      await rmAsar(path.join(dir, name))
    }
  }
  catch {
    // 清理失败不阻塞热更链路（下次下载再清）
  }
}
