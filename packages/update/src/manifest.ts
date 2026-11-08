/** 单份更新清单：三通道各取所需；缺省段表示该通道本次无更新。 */
export interface UpdateManifest {
  apps?: Record<string, { version: string, url: string, sha256: string }>
  asar?: { version: string, url: string, sha256: string }
  package?: { version: string, url: string, sha256: string, silentArgs: string }
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
