import type { AppInstance, AppManifest } from '@shell/shared'
import type { AppOpener } from '../opener'

/**
 * packaged 形态：打包好的 dist，经 app://<appId>/ 协议服务。
 * 协议处理器（standard+secure + MIME 白名单）在组合根注册到 persist 分区 Session——
 * 本 opener 只负责把 WebContentsView 挂到工作台容器。
 * M2 完整实现：WebContentsView 生命周期 + 崩溃退避 reload（Chrome 式 Tab 恢复）。
 */
export class PackagedOpener implements AppOpener {
  readonly kind = 'packaged'

  supports(entry: AppManifest['entry']): boolean {
    return entry.kind === 'packaged'
  }

  async open(manifest: AppManifest, instance: AppInstance): Promise<void> {
    instance.handle.url = `app://${manifest.id}/index.html`
  }

  async close(instance: AppInstance): Promise<void> {
    instance.handle.view = undefined
  }
}
