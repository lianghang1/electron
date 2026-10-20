import type { DesktopAppManifest, DesktopConfig } from '@desktop/shared'

/**
 * 顶层 entry（单站直嵌形态）合成为 resource App 的唯一收口：
 * name/version/type/permissions 在此定稿缺省值，registry 与下游拿到的恒为完整 manifest。
 */
export function synthesizeResourceEntry(
  appId: string,
  entry: NonNullable<DesktopConfig['entry']>,
): DesktopAppManifest {
  return {
    id: entry.id ?? appId,
    name: hostOf(entry.url),
    version: '0.0.0',
    type: 'internal',
    kind: 'resource',
    entry: { type: 'web', url: entry.url },
    permissions: entry.permissions ?? ['storage'],
  }
}

/** 资源名称兜底取 URL 域名：单站形态顶栏展示宿主名，该值仅在多资源 Tab 条出现（多站走 apps.manifests 显式命名） */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  }
  catch {
    return url
  }
}
