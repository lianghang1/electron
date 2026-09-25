import type { DesktopAppManifest } from '@desktop/shared'

/**
 * 应用定义注册表：只管 App 定义（manifest），不涉及运行时实例与 UI。
 * 未来可从代码注册扩展到远程配置中心 / 企业应用中心 / 应用市场。
 */
export class AppRegistry {
  private apps = new Map<string, DesktopAppManifest>()

  register(app: DesktopAppManifest): void {
    if (this.apps.has(app.id))
      throw new Error(`[app-registry] App already registered: ${app.id}`)
    this.apps.set(app.id, app)
  }

  unregister(appId: string): void {
    this.apps.delete(appId)
  }

  get(appId: string): DesktopAppManifest | undefined {
    return this.apps.get(appId)
  }

  has(appId: string): boolean {
    return this.apps.has(appId)
  }

  list(): DesktopAppManifest[] {
    return [...this.apps.values()]
  }
}
