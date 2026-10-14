/**
 * UI 中的 Tab：只携带可序列化数据。
 * WebContents 等运行时对象留在 Main，通过 tabId 关联，禁止放进本模型。
 */
export interface DesktopTab {
  id: string
  appId: string
  instanceId: string
  title: string
  icon?: string
  url: string
  active: boolean
  closable: boolean
  /** 页面加载中（Main 侧 loading 事件维护）：Tab 条 spinner 与视图区骨架屏消费 */
  isLoading: boolean
  createdAt: number
}

/** 打开 Tab 的入参：只指定 App，具体 Instance / URL 由平台决定 */
export interface OpenTabOptions {
  appId: string
}

/**
 * Web App 容器区域：Shell renderer 上承载 WebContentsView 的矩形，
 * 坐标系与窗口内容区原点一致（getBoundingClientRect 直接可用）。
 */
export interface WorkAreaRect {
  x: number
  y: number
  width: number
  height: number
}
