import type { AppInstance, AppManifest } from '@shell/shared'
import type { AppOpener } from '../opener'
import type { ViewHost } from '../view-host'
import { app } from 'electron'

/**
 * local 形态：构建产物经 app:// 协议服务（协议由组合根在该应用的会话分区注册）。
 * 开发态经 entry.devUrl 直连 dev server，与 remote 同一条加载链（同一套防线）。
 */
export class LocalOpener implements AppOpener {
  readonly kind = 'local'

  constructor(
    private readonly views: ViewHost,
    /** 应用 dist 根目录（打包: resources/apps；dev: 本地预览目录） */
    private readonly appsRoot: string,
    /** JSAPI 受控桥 preload 的绝对路径（out/preload/jsapi.cjs）：local 与 remote 同一受控桥 */
    private readonly jsapiPreloadPath: string,
  ) {}

  supports(entry: AppManifest['entry']): boolean {
    return entry.kind === 'local'
  }

  async open(manifest: AppManifest, instance: AppInstance): Promise<void> {
    const entry = manifest.entry as { kind: 'local', dir?: string, devUrl?: string }
    const host = entry.dir ?? manifest.id
    const url = !app.isPackaged && entry.devUrl ? entry.devUrl : `app://${host}/index.html`
    instance.handle.view = this.views.create({
      instanceId: instance.instanceId,
      appId: manifest.id,
      url,
      preload: this.jsapiPreloadPath,
      partition: `persist:app-${manifest.id}`,
      // standard+secure 协议的 origin = app://<host>，精确匹配，不用尾点前缀
      allowedOrigins: [`app://${host}`],
      permissions: manifest.permissions,
    })
  }

  async close(instance: AppInstance): Promise<void> {
    this.views.destroy(instance.instanceId)
    instance.handle.view = undefined
  }
}
