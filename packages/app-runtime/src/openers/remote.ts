import type { AppInstance, AppManifest } from '@shell/shared'
import type { AppOpener } from '../opener'

/**
 * remote 形态：在线网页，WebContentsView 加载 + JSAPI 受控桥。
 * 安全三道闸：manifest.devices 声明 → AppService 校验（third-party 门禁）→ origin 白名单。
 * M2 完整实现：受控桥注入（按声明过滤暴露）+ persist 分区。
 */
export class RemoteOpener implements AppOpener {
  readonly kind = 'remote'

  supports(entry: AppManifest['entry']): boolean {
    return entry.kind === 'remote'
  }

  async open(manifest: AppManifest, instance: AppInstance): Promise<void> {
    const entry = manifest.entry as { kind: 'remote', url: string, origins: string[] }
    instance.handle.url = entry.url
    instance.handle.allowedOrigins = entry.origins
  }

  async close(instance: AppInstance): Promise<void> {
    instance.handle.view = undefined
  }
}
