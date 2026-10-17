import type { TabMenuAction } from '@desktop/shared'
import type { AppRegistry } from '../app/app-registry'
import type { CacheService } from '../cache/cache-service'
import type { TabService } from '../tab/tab-service'
import type { OverlayWindowService } from '../window/overlay-window'
import type { CallerResolver } from './caller-context'
import { DesktopError } from '@desktop/shared'
import { assertShell } from './caller-context'
import { handle } from './handle'

export interface MenuIpcDeps {
  overlayService: OverlayWindowService
  /** 菜单打开时按 manifest.chrome 计算 closable（套壳模式 Tab 不给关闭入口） */
  registry: AppRegistry
  /** 菜单动作执行：reload/close 需要 Tab 体系装配，未启用时动作静默忽略 */
  tabService?: TabService
  cacheService: CacheService
  resolver: CallerResolver
}

/**
 * menu 域通道注册：Tab 右键菜单（原 overlay 域菜单通道迁入）。
 * open 仅 Shell（assertShell）；select / dismiss 仅浮层窗（域挂载兜底 + isOverlay 双保险），
 * 选中动作由 Main 直接执行对应 service（Shell 无需中转，动作结果不回传）。
 */
export function registerMenuIpc(deps: MenuIpcDeps): void {
  // Shell 发起：打开 Tab 右键菜单浮层窗（原生窗承载，页面内容保持可见）
  handle('menu:open', (e, menu) => {
    assertShell(deps.resolver.resolve(e.sender))
    if (!menu || typeof menu.tabId !== 'string' || typeof menu.appId !== 'string') { throw new DesktopError('IPC_ERROR', 'invalid tab context menu') }
    const x = Number(menu.x)
    const y = Number(menu.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) { throw new DesktopError('IPC_ERROR', 'invalid menu anchor') }
    // 套壳模式（chrome: 'single'）Tab 固定不可关：菜单不给「关闭标签页」入口
    const closable = deps.registry.get(menu.appId)?.chrome !== 'single'
    deps.overlayService.pushMenu({ tabId: menu.tabId, appId: menu.appId, x, y, closable })
  })
  // 菜单窗回传：选中菜单项 → Main 执行动作后关闭菜单
  handle('menu:select', (e, action) => {
    if (!deps.overlayService.isOverlay(e.sender)) {
      throw new DesktopError('PERMISSION_DENIED', 'This channel is overlay-only')
    }
    const menu = deps.overlayService.getMenu()
    if (!menu) { return }
    deps.overlayService.dismissMenu()
    // 关窗先行，动作异步执行（清缓存可能耗时，不阻塞菜单关闭）
    void execMenuAction(action as TabMenuAction, menu.tabId, menu.appId, deps)
  })
  // 菜单窗回传：ESC / 点击菜单外关闭
  handle('menu:dismiss', (e) => {
    if (!deps.overlayService.isOverlay(e.sender)) {
      throw new DesktopError('PERMISSION_DENIED', 'This channel is overlay-only')
    }
    deps.overlayService.dismissMenu()
  })
  // 菜单窗 mounted 后拉取挂起菜单（对账推送竞态）
  handle('menu:sync', (e) => {
    if (!deps.overlayService.isOverlay(e.sender)) {
      throw new DesktopError('PERMISSION_DENIED', 'This channel is overlay-only')
    }
    return deps.overlayService.syncMenu(e.sender)
  })
}

/** 菜单动作 → service 调用（reload/close 需要 Tab 体系装配，未启用时动作静默忽略） */
async function execMenuAction(
  action: TabMenuAction,
  tabId: string,
  appId: string,
  deps: MenuIpcDeps,
): Promise<void> {
  const { tabService, cacheService } = deps
  try {
    switch (action) {
      case 'reload':
        await tabService?.reload(tabId)
        break
      case 'close':
        await tabService?.close(tabId)
        break
      case 'clearCache':
        await cacheService.clearCache(appId)
        break
      case 'clearSite':
        await cacheService.clearSiteData(appId)
        break
    }
  }
  catch {
    // 菜单动作失败静默：目标 Tab 可能已关闭（幂等语义），UI 以 tabs:updated 推送为准
  }
}
