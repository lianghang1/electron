import type { TabService } from '../tab/tab-service'
import type { WebService } from '../web/web-service'
import type { CallerResolver } from './caller-context'
import { assertShell } from './caller-context'
import { handle } from './handle'

export interface TabsIpcDeps {
  /** features.tabs = false 时为空：单应用形态不暴露 Tab 通道，整体跳过注册 */
  tabService?: TabService
  webService?: WebService
  resolver: CallerResolver
}

/**
 * Tab 域通道注册：打开 / 切换 / 刷新 / 关闭 + 容器区域。
 */
export function registerTabsIpc(deps: TabsIpcDeps): void {
  const { tabService, webService } = deps
  if (!tabService || !webService) { return }

  handle('tabs:list', () => tabService.list())
  handle('tabs:open', (_e, options) => tabService.open(options))
  handle('tabs:close', (_e, tabId) => tabService.close(tabId))
  handle('tabs:activate', (_e, tabId) => tabService.activate(tabId))
  handle('tabs:reload', (_e, tabId) => tabService.reload(tabId))
  // 容器区域只允许 Shell 声明，Web App 无权改 Shell 布局
  handle('tabs:setWorkArea', (e, rect) => {
    assertShell(deps.resolver.resolve(e.sender))
    webService.setWorkArea(rect)
  })
}
