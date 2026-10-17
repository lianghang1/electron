import type { DeviceConfigKind, TabMenuAction } from '@desktop/shared'
import type { AppRegistry } from '../app/app-registry'
import type { CacheService } from '../cache/cache-service'
import type { CaptureDialogSessionService } from '../devices/capture/dialog-session'
import type { Logger } from '../logger/logger'
import type { TabService } from '../tab/tab-service'
import type { OverlayWindowService } from '../window/overlay-window'
import type { CallerResolver } from './caller-context'
import { DesktopError } from '@desktop/shared'
import { assertShell } from './caller-context'
import { handle } from './handle'

/** 菜单动作白名单：契约类型只在编译层生效，渲染层运行时传值须经校验 */
const MENU_ACTIONS: readonly TabMenuAction[] = ['reload', 'clearCache', 'clearSite', 'close']

/** 设备配置浮层类别白名单：契约类型只在编译层生效，渲染层运行时传值须经校验 */
const CONFIG_KINDS: readonly DeviceConfigKind[] = ['scanner', 'capture']

export interface OverlayIpcDeps {
  overlayService: OverlayWindowService
  /** 拍摄浮层关闭回传：执行会话收尾（回收预览 / 隐藏拍摄窗 / 通知发起 tab） */
  captureDialog: CaptureDialogSessionService
  /** 菜单打开时按 manifest.chrome 计算 closable（套壳模式 Tab 不给关闭入口） */
  registry: AppRegistry
  /** 菜单动作执行：选中项由 Main 直接调 service，Shell 无需中转 */
  tabService?: TabService
  cacheService: CacheService
  logger: Logger
  resolver: CallerResolver
}

/**
 * 浮层域通道注册：回传类仅接受浮层窗口自身（消息窗 toast/下载、弹窗窗授权决策、
 * 菜单窗选中/关闭、拍摄窗取消会话），Main 按窗口身份分发；打开菜单仅 Shell 可发起。
 */
export function registerOverlayIpc(deps: OverlayIpcDeps): void {
  // 浮层页面量高回报：Main 据此调整对应浮层窗尺寸与锚定位置
  handle('overlay:resize', (e, height) => {
    deps.overlayService.applyResize(e.sender, height)
  })
  // 浮层页 mounted 后主动拉取当前状态（按窗口身份分发，杜绝跨窗状态污染）
  handle('overlay:sync', (e) => {
    if (!deps.overlayService.isOverlay(e.sender)) {
      throw new DesktopError('PERMISSION_DENIED', 'This channel is overlay-only')
    }
    return deps.overlayService.syncFor(e.sender)
  })
  // 消息窗鼠标穿透切换（按窗口身份生效，弹窗/菜单窗不参与）
  handle('overlay:ignoreMouse', (e, ignore) => {
    deps.overlayService.setPanelMouseIgnore(e.sender, ignore === true)
  })
  // Shell 发起：打开 Tab 右键菜单浮层窗（原生窗承载，页面内容保持可见）
  handle('overlay:openMenu', (e, menu) => {
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
  handle('overlay:selectMenu', (e, action) => {
    if (!deps.overlayService.isOverlay(e.sender)) {
      throw new DesktopError('PERMISSION_DENIED', 'This channel is overlay-only')
    }
    if (typeof action !== 'string' || !MENU_ACTIONS.includes(action as TabMenuAction)) {
      throw new DesktopError('IPC_ERROR', `invalid menu action: ${String(action)}`)
    }
    const menu = deps.overlayService.getMenu()
    if (!menu) { return }
    deps.overlayService.dismissMenu()
    // 关窗先行，动作异步执行（清缓存可能耗时，不阻塞菜单关闭）
    void execMenuAction(action as TabMenuAction, menu.tabId, menu.appId, deps)
  })
  // 菜单窗回传：ESC / 点击菜单外关闭
  handle('overlay:dismissMenu', (e) => {
    if (!deps.overlayService.isOverlay(e.sender)) {
      throw new DesktopError('PERMISSION_DENIED', 'This channel is overlay-only')
    }
    deps.overlayService.dismissMenu()
  })
  // 仅供拍摄窗页面回传：取消拍摄浮层（× / ESC）→ 会话收尾（隐藏拍摄窗 + 通知发起 tab）
  handle('overlay:dismissCapture', (e) => {
    if (!deps.overlayService.isCaptureWindow(e.sender)) {
      throw new DesktopError('PERMISSION_DENIED', 'This channel is capture-overlay-only')
    }
    deps.captureDialog.cancelByOverlay()
  })
  // 业务页（设备测试页）发起：打开设备配置浮层窗（原生窗承载，盖过 Web 容器区域）
  handle('overlay:openConfig', (e, kind) => {
    if (typeof kind !== 'string' || !CONFIG_KINDS.includes(kind as DeviceConfigKind)) {
      throw new DesktopError('IPC_ERROR', `invalid device config kind: ${String(kind)}`)
    }
    deps.overlayService.pushConfigDialog(kind as DeviceConfigKind)
  })
  // 仅供配置窗页面回传：关闭设备配置浮层（弹窗关闭按钮 / ESC）
  handle('overlay:dismissConfig', (e) => {
    if (!deps.overlayService.isConfigWindow(e.sender)) {
      throw new DesktopError('PERMISSION_DENIED', 'This channel is config-overlay-only')
    }
    deps.overlayService.dismissConfigDialog()
  })
}

/** 菜单动作 → service 调用（reload/close 需要 Tab 体系装配，未启用时动作静默忽略） */
async function execMenuAction(
  action: TabMenuAction,
  tabId: string,
  appId: string,
  deps: OverlayIpcDeps,
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
  catch (error) {
    // 目标 Tab 已关属幂等场景；其余失败留痕排查（UI 以 tabs:updated 推送为准，不阻塞菜单）
    deps.logger.warn(`tab menu action failed: ${action}`, {
      tabId,
      appId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
