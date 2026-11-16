/**
 * 浮层表面渲染视图类型：与主进程 OverlayCenter 的 payload 形状对应。
 * 业务组件只认识这里的视图契约，不感知窗口基建（plane/焦点/穿透）。
 */

/** 通知项视图（kernel 账本项的结构投影，渲染层不直接依赖 kernel） */
export interface NotificationItem {
  id: string
  title: string
  body?: string
  /** 来源应用展示名（toast 顶行）；平台自身推送可省略 */
  appName?: string
  level: 'info' | 'success' | 'warning' | 'error'
  createdAt: number
  ttlMs: number
}

/** 权限请求视图（OverlayCenter.requestPermission 的队首投影） */
export interface PermissionView {
  requestId: string
  appId: string
  /** 应用展示名；未解析时为空，模板回退 appId */
  appName?: string
  origin: string
  permission: string
}

/** 页签菜单视图（锚点坐标为 plane 内 CSS 像素） */
export interface MenuView {
  id: string
  tabId: string
  appId: string
  x: number
  y: number
  closable: boolean
}
