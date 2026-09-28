/**
 * 缓存清理域契约：对应浏览器「清除浏览数据」的两档动作，作用域为单个容器。
 * Shell 专属管理通道：调用者为可信的平台 Shell，目标容器 appId 是显式参数，
 * 不受「契约参数不携带 appId」防伪造约束（该约束针对不可信 App 通道）。
 */
export type CacheIpc = {
  /** 清理容器可再生缓存（HTTP / 图片缓存），不影响登录态 */
  'cache:clear': (appId: string) => Promise<void>
  /** 清理容器站点数据（cookie / localStorage / IndexedDB 等），等于该容器登出；完成后容器自动重载 */
  'cache:clearSite': (appId: string) => Promise<void>
}
