import type { BuildPlatform, PackageArtifact } from './installers/contract'

/** 单份更新清单：三通道各取所需；缺省段表示该通道本次无更新。 */
export interface UpdateManifest {
  apps?: Record<string, { version: string, url: string, sha256: string }>
  asar?: { version: string, url: string, sha256: string }
  /**
   * 整包按构建目标平台分组：设备只取自己平台的条目，缺失即跳过整包更新。
   * 一份清单服务多平台设备，落地差异由 PackageInstaller 承担。
   */
  package?: {
    version: string
    artifacts: Partial<Record<BuildPlatform, PackageArtifact>>
  }
}

/** 清单地址与下载地址都必须落在 flavor 声明的源站内，防止清单被劫持后拉取任意地址。 */
export function assertAllowedUrl(url: string, allowedOrigins: string[]): void {
  if (!allowedOrigins.includes(new URL(url).origin)) {
    throw new Error(`update url origin not allowed: ${url}`)
  }
}

export function fetchUpdateManifest(manifestUrl: string, allowedOrigins: string[]): Promise<UpdateManifest> {
  assertAllowedUrl(manifestUrl, allowedOrigins)
  return fetch(manifestUrl).then(async (res) => {
    if (!res.ok) { throw new Error(`manifest fetch failed: ${res.status}`) }
    return await res.json() as UpdateManifest
  })
}
