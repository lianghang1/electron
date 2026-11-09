import type { PendingMark } from './pointer'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { compareVersions } from '@shell/shared'
import extract from 'extract-zip'

const nodeRequire = createRequire(import.meta.url)

/**
 * Electron 把 *.asar 路径代理成 asar 虚拟文件系统，fs 删除真实 asar 文件会报 EISDIR。
 * original-fs 是 Electron 内置模块（Node 测试环境没有，回退 node:fs）。
 */
function asarFs(): typeof import('node:fs') {
  try {
    return nodeRequire('original-fs') as typeof import('node:fs')
  }
  catch {
    return nodeRequire('node:fs') as typeof import('node:fs')
  }
}

/** 热更包文件名：版本化命名，下载即终名，引导层永不 rename */
export function coreFileName(version: string): string {
  return `core-${version.replace(/[^\w.-]/g, '_')}.asar`
}

export interface BundleManifest {
  version: string
  file: string
  sha256: string
  /** 热更代码依赖的 resources 下限；本机 resources 更旧时拒绝应用，等整包更新先行 */
  minResourcesVersion?: string
}

export type ApplyBundleResult
  = | { status: 'ready', pending: PendingMark }
    | { status: 'blocked', minResourcesVersion: string }

export interface ApplyBundleOptions {
  zipPath: string
  externalVersion: string
  targetDir: string
  /** 本机 resources 版本（after-pack 写入的 .resources-version）；null = 不设限 */
  resourcesVersion: string | null
}

/**
 * 热更包自描述校验（源码依据 master packages/core/src/updater/bundle.ts）：
 * zip 内 update.json 声明版本 / 条目名 / sha256，与外部清单版本一致性比对后，
 * 只取声明的固定条目字节做 sha256 强校验，再以版本化终名落盘。
 * 校验通过由调用方写 pending 指针；失败一律清理，不留半更新状态。
 */
export async function applyBundle(options: ApplyBundleOptions): Promise<ApplyBundleResult> {
  const staging = `${options.zipPath}.d`
  mkdirSync(options.targetDir, { recursive: true })
  try {
    await extract(options.zipPath, { dir: staging })
    const bundle = parseBundleManifest(staging, options.externalVersion)
    if (bundle.minResourcesVersion && options.resourcesVersion
      && compareVersions(bundle.minResourcesVersion, options.resourcesVersion) > 0) {
      return { status: 'blocked', minResourcesVersion: bundle.minResourcesVersion }
    }
    const bytes = readFileSync(join(staging, bundle.file))
    const actual = createHash('sha256').update(bytes).digest('hex')
    if (actual !== bundle.sha256.toLowerCase()) {
      throw new Error(`asar checksum mismatch: expected ${bundle.sha256}, got ${actual}`)
    }
    const file = coreFileName(bundle.version)
    asarFs().writeFileSync(join(options.targetDir, file), bytes)
    return {
      status: 'ready',
      pending: { version: bundle.version, file, sha256: bundle.sha256 },
    }
  }
  finally {
    rmSync(staging, { recursive: true, force: true })
    rmSync(options.zipPath, { force: true })
  }
}

function parseBundleManifest(staging: string, externalVersion: string): BundleManifest {
  const file = join(staging, 'update.json')
  if (!existsSync(file)) { throw new Error('asar bundle missing update.json') }
  let bundle: BundleManifest
  try {
    bundle = JSON.parse(readFileSync(file, 'utf8')) as BundleManifest
  }
  catch (error) {
    throw new Error(`asar bundle update.json invalid: ${String(error)}`)
  }
  if (!bundle?.version || !bundle.file || !bundle.sha256) {
    throw new Error('asar bundle update.json missing required fields (version/file/sha256)')
  }
  if (!/^[\w.-]+\.asar$/.test(bundle.file)) {
    throw new Error(`asar bundle entry is not a plain file name: ${bundle.file}`)
  }
  if (!existsSync(join(staging, bundle.file))) {
    throw new Error(`asar bundle entry not found: ${bundle.file}`)
  }
  if (bundle.version !== externalVersion) {
    throw new Error(`asar bundle version mismatch: external ${externalVersion}, bundle ${bundle.version}`)
  }
  return bundle
}

/** 删真实 asar 文件必须绕过 asar 补丁 */
export function removeAsar(file: string): void {
  asarFs().rmSync(file, { force: true })
}
