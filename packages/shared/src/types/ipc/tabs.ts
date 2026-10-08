import type { DesktopTab, OpenTabOptions, WorkAreaRect } from '../tab'
import { defineDomain, invoke, push } from '../../domain'

/**
 * Tab 域契约：打开 / 切换 / 刷新 / 关闭 + 容器区域。
 */
export const tabsDomain = defineDomain('tabs', {
  list: invoke<() => DesktopTab[]>(),
  open: invoke<(options: OpenTabOptions) => DesktopTab>(),
  close: invoke<(tabId: string) => void>(),
  activate: invoke<(tabId: string) => void>(),
  reload: invoke<(tabId: string) => void>(),
  setWorkArea: invoke<(rect: WorkAreaRect) => void>(),

  // ---- Main → Renderer 推送 ----
  /** Tab 列表任何变化（创建 / 激活 / 关闭）后推送全量列表，UI 直接渲染 */
  updated: push<[DesktopTab[]]>(),
})
