import { defineDomain, invoke, push } from '../../domain'

/** 菜单项动作：菜单窗回传后由 Main 直接执行对应 service（Shell 无需中转） */
export type TabMenuAction = 'reload' | 'clearCache' | 'clearSite' | 'close'

/** Tab 右键菜单：Shell 发起，浮层窗在 (x, y)（主窗内容区坐标）附近渲染菜单卡 */
export interface TabContextMenu {
  /** 菜单实例 id：防止重复打开 / 页面 key 对账 */
  id: string
  tabId: string
  appId: string
  x: number
  y: number
  /** 是否提供「关闭标签页」：Main 按激活 App 的 chrome 配置计算（套壳模式 Tab 固定不关） */
  closable: boolean
}

/**
 * menu 域契约 —— Tab 右键菜单（菜单窗专属回传 + Shell 发起）。
 * 选中动作由 Main 直接执行对应 service（Shell 无需中转）。
 * 文件与 core/src/ipc/menu.ts（注册实现）一一对应。
 */
export const menuDomain = defineDomain('menu', {
  /** 仅 Shell 发起：打开 Tab 右键菜单浮层窗（原生窗承载，页面内容保持可见） */
  open: invoke<(menu: { tabId: string, appId: string, x: number, y: number }) => void>(),
  /** 仅菜单窗回传：选中菜单项（Main 执行动作后自动关菜单） */
  select: invoke<(action: TabMenuAction) => void>(),
  /** 仅菜单窗回传：关闭菜单（ESC / 点击菜单外） */
  dismiss: invoke<() => void>(),
  /** 菜单窗 mounted 后拉取当前挂起菜单（对账推送竞态） */
  sync: invoke<() => TabContextMenu | null>(),

  // ---- Main → Renderer 推送 ----
  /** Tab 右键菜单变化推送（菜单窗数据源，null = 已关闭） */
  menuUpdated: push<[TabContextMenu | null]>(),
})
