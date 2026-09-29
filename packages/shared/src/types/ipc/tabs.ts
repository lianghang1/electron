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
  /**
   * Shell DOM 浮层（Tab 右键菜单等）需要盖住 Web 容器区域时调用：
   * true = 激活视图归零让位（Shell DOM 无原生层级，压不过 WebContentsView），
   * false = 恢复容器区域显示。仅 Shell 可调用，App 无权操控视图显示。
   */
  'tabs:setViewSuppressed': (suppressed: boolean) => void

  // ---- Main → Renderer 推送 ----
  /** Tab 列表任何变化（创建 / 激活 / 关闭）后推送全量列表，UI 直接渲染 */
  'tabs:updated': [DesktopTab[]]
}
