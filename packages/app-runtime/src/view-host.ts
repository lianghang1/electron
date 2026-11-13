/**
 * ViewHost SPI：app-runtime 声明它需要窗口系统提供的能力，
 * 不 import WindowSystem——具体实现由组合根注入（window 包实现）。
 *
 * 视图 = WebContentsView（packaged/remote 形态的页面容器）。
 * 布局契约：渲染层自绘 chrome，内容区矩形经 bridge 上报（reportContentRect），
 * ViewHost 据此对激活视图 setBounds——主进程永不猜测 chrome 高度。
 */
export interface ViewSpec {
  instanceId: string
  appId: string
  /** 完整加载地址（app://<appId>/index.html 或 remote url） */
  url: string
  /** JSAPI 受控桥 preload（remote/packaged 统一注入同一受控桥） */
  preload?: string
  /** 持久化会话分区名（remote 用 appId 隔离 Cookie） */
  partition?: string
  /** 允许导航与 JSAPI 的 origin 白名单；空数组 = 全部拒绝 */
  allowedOrigins: string[]
  /** manifest 声明的平台权限：session 权限 check 同步判定的唯一来源 */
  permissions?: string[]
}

export interface ViewHost {
  /** 创建视图（隐藏态挂载，不显示）；返回值由 opener 存入 instance.handle.view */
  create: (spec: ViewSpec) => unknown
  /** 激活：视图按最新内容区矩形显示并置顶 */
  activate: (instanceId: string) => void
  /** 隐藏（切到 embedded 页或其他视图时调用） */
  deactivate: (instanceId: string) => void
  /** 销毁并从窗口摘除 */
  destroy: (instanceId: string) => void
  /** 渲染层上报的内容区矩形（CSS px，相对窗口内容原点） */
  setContentRect: (rect: { x: number, y: number, width: number, height: number }) => void
}
