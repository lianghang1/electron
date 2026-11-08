import type { AppInstance, AppManifest } from '@shell/shared'
import type { AppOpener } from '../opener'
import type { ViewHost } from '../view-host'

/**
 * packaged 形态：打包好的 dist（resources/apps/<dir>/），经 app:// 协议服务。
 * 协议注册在组合根完成（registerAppScheme + registerAppProtocol），
 * 本 opener 只负责创建视图容器。
 */
export class PackagedOpener implements AppOpener {
  readonly kind = 'packaged'

  constructor(
    private readonly views: ViewHost,
    /** 应用 dist 根目录（打包: resources/apps；dev: 本地预览目录） */
    private readonly appsRoot: string,
  ) {}

  supports(entry: AppManifest['entry']): boolean {
    return entry.kind === 'packaged'
  }

  async open(manifest: AppManifest, instance: AppInstance): Promise<void> {
    const entry = manifest.entry as { kind: 'packaged', dir?: string }
    const host = entry.dir ?? manifest.id
    instance.handle.view = this.views.create({
      instanceId: instance.instanceId,
      appId: manifest.id,
      url: `app://${host}/index.html`,
      // standard+secure 协议的 origin = app://<host>，精确匹配，不用尾点前缀
      allowedOrigins: [`app://${host}`],
    })
  }

  async close(instance: AppInstance): Promise<void> {
    this.views.destroy(instance.instanceId)
    instance.handle.view = undefined
  }
}
