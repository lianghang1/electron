/**
 * Tab 域契约：打开 / 切换 / 刷新 / 关闭 + 容器区域。
 */
import type { DesktopTab, OpenTabOptions, WorkAreaRect } from '../tab'

export type TabsIpc = {
  'tabs:list': () => DesktopTab[]
  'tabs:open': (options: OpenTabOptions) => DesktopTab
  'tabs:close': (tabId: string) => void
  'tabs:activate': (tabId: string) => void
  'tabs:reload': (tabId: string) => void
  'tabs:setWorkArea': (rect: WorkAreaRect) => void

  // ---- Main → Renderer 推送 ----
  /** Tab 列表任何变化（创建 / 激活 / 关闭）后推送全量列表，UI 直接渲染 */
  'tabs:updated': [DesktopTab[]]
}
