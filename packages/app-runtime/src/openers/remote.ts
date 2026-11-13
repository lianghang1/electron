import type { AppInstance, AppManifest } from '@shell/shared'
import type { AppOpener } from '../opener'
import type { ViewHost } from '../view-host'

/**
 * remote 形态：在线网页，WebContentsView 加载 + JSAPI 受控桥。
 * 安全三道闸：
 * 1. manifest.devices 声明 → 主进程 jsapi-call 处理器按声明过滤（组合根接线）
 * 2. AppService 校验 third-party 门禁
 * 3. origin 白名单：本 opener 传入 allowedOrigins，ViewHost 在视图上强制
 *    （导航出白名单即拦截；JSAPI 调用按 senderFrame.origin 二次校验）
 */
export class RemoteOpener implements AppOpener {
  readonly kind = 'remote'

  constructor(
    private readonly views: ViewHost,
    /** JSAPI 受控桥 preload 的绝对路径（out/preload/jsapi.js） */
    private readonly jsapiPreloadPath: string,
  ) {}

  supports(entry: AppManifest['entry']): boolean {
    return entry.kind === 'remote'
  }

  async open(manifest: AppManifest, instance: AppInstance): Promise<void> {
    const entry = manifest.entry as { kind: 'remote', url: string, origins: string[] }
    instance.handle.view = this.views.create({
      instanceId: instance.instanceId,
      appId: manifest.id,
      url: entry.url,
      // remote 页面拿到的不是完整 desktop 桥，只有受控 jsapi
      preload: this.jsapiPreloadPath,
      partition: `persist:app-${manifest.id}`,
      allowedOrigins: entry.origins,
      permissions: manifest.permissions,
    })
  }

  async close(instance: AppInstance): Promise<void> {
    this.views.destroy(instance.instanceId)
    instance.handle.view = undefined
  }
}
