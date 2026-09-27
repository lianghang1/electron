/**
 * App 域契约：应用定义与调用者上下文。
 */
import type { AppContext } from '../context'
import type { DesktopAppManifest, RegisteredApp } from '../manifest'

export type AppIpc = {
  'app:list': () => RegisteredApp[]
  'app:getManifest': (appId: string) => DesktopAppManifest | undefined
  'app:getCurrent': () => AppContext
}
