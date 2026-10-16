import type { AppSource, DesktopAppManifest, RegisteredApp } from '@desktop/shared'

/**
 * 应用定义注册表：只管 App 定义（manifest），不涉及运行时实例与 UI。
 * 未来可从代码注册扩展到远程配置中心 / 企业应用中心 / 应用市场。
 */
export class AppRegistry {
  private entries = new Map<string, RegisteredApp>()

  register(app: DesktopAppManifest, source: AppSource = 'code'): void {
    if (this.entries.has(app.id)) { throw new Error(`[app-registry] App already registered: ${app.id}`) }
    this.entries.set(app.id, { manifest: app, source })
  }

  unregister(appId: string): void {
    this.entries.delete(appId)
  }

  get(appId: string): DesktopAppManifest | undefined {
    return this.entries.get(appId)?.manifest
  }

  has(appId: string): boolean {
    return this.entries.has(appId)
  }

  list(): RegisteredApp[] {
    return [...this.entries.values()]
  }
}
