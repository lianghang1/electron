import type { BuildPlatform, PackageArtifact } from './installers/contract'
import { assertAllowedUrl } from '@shell/shared'
import { z } from 'zod'

export { assertAllowedUrl }

/** 单份更新清单：三通道各取所需；缺省段表示该通道无更新。 */
export interface UpdateManifest {
  apps?: Record<string, { version: string, url: string, sha256: string }>
  /** 主程序代码热更包（zip 内 update.json 自描述 + asar 条目，见 boot/bundle.ts） */
  asar?: { version: string, url: string, sha256: string, minResourcesVersion?: string }
  /**
   * 整包按构建目标平台分组：设备只取自己平台的条目，缺失即跳过整包更新。
   * 一份清单服务多平台设备，落地差异由 PackageInstaller 承担。
   */
  package?: {
    version: string
    artifacts: Partial<Record<BuildPlatform, PackageArtifact>>
  }
  /** 最低可用版本：当前壳版本低于它则强制更新（见 ForceUpdateGate） */
  minVersion?: string
}

/** 清单结构校验：服务端下发的版本/地址/摘要必须齐全且形状正确，杜绝畸形值进入落地链路。 */
const hash = z.string().regex(/^[a-f0-9]{64}$/i, 'sha256 须为 64 位十六进制')
const url = z.string().url()
/** 应用/asar 条目带自身版本；整包版本由 package.version 统一给出，条目只需地址与摘要 */
const versionedArtifactSchema = z.object({ version: z.string().min(1), url, sha256: hash })
const asarArtifactSchema = versionedArtifactSchema.extend({ minResourcesVersion: z.string().min(1).optional() })
const packageArtifactSchema = z.object({ url, sha256: hash })
const updateManifestSchema = z.object({
  apps: z.record(z.string(), versionedArtifactSchema).optional(),
  asar: asarArtifactSchema.optional(),
  package: z.object({
    version: z.string().min(1),
    artifacts: z.record(z.string(), packageArtifactSchema),
  }).optional(),
  minVersion: z.string().min(1).optional(),
}).passthrough()

export function parseUpdateManifest(raw: unknown, allowedOrigins: readonly string[]): UpdateManifest {
  const parsed = updateManifestSchema.parse(raw) as UpdateManifest
  for (const url of [
    ...Object.values(parsed.apps ?? {}).map(a => a.url),
    parsed.asar?.url,
    ...Object.values(parsed.package?.artifacts ?? {}).map(a => a.url),
  ].filter((u): u is string => Boolean(u))) {
    assertAllowedUrl(url, allowedOrigins)
  }
  return parsed
}

export function fetchUpdateManifest(manifestUrl: string, allowedOrigins: string[]): Promise<UpdateManifest> {
  assertAllowedUrl(manifestUrl, allowedOrigins)
  return fetch(manifestUrl).then(async (res) => {
    if (!res.ok) { throw new Error(`manifest fetch failed: ${res.status}`) }
    return parseUpdateManifest(await res.json(), allowedOrigins)
  })
}
