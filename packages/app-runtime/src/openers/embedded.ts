import type { AppInstance, AppManifest } from '@shell/shared'
import type { AppOpener } from '../opener'

/**
 * embedded 形态：嵌入工作台的融合页。
 * 页面组件经 builtin-routes 注册，shell 路由切换渲染，零桥接开销——
 * 直接同进程调用 window.desktop（类型化 RPC 客户端），无 WebContentsView。
 */
export class EmbeddedOpener implements AppOpener {
  readonly kind = 'embedded'

  supports(entry: AppManifest['entry']): boolean {
    return entry.kind === 'embedded'
  }

  async open(manifest: AppManifest, instance: AppInstance): Promise<void> {
    instance.handle.route = (manifest.entry as { kind: 'embedded', route: string }).route
  }

  async close(_instance: AppInstance): Promise<void> {}
}
