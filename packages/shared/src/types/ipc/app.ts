import type { AppContext } from '../context'
import type { DesktopAppManifest, RegisteredApp } from '../manifest'
import { defineDomain, invoke } from '../../domain'

/**
 * App 域契约：应用定义与调用者上下文。
 */
export const appDomain = defineDomain('app', {
  list: invoke<() => RegisteredApp[]>(),
  getManifest: invoke<(appId: string) => DesktopAppManifest | null>(),
  getCurrent: invoke<() => AppContext>(),
})
