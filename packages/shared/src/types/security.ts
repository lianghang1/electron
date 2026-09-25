/**
 * App 级安全策略：跟随 App Manifest 声明，由平台在 Web App 容器里执行。
 * 这里的都是「平台可以替 App 执行」的行为约束；sandbox / contextIsolation
 * 等进程级安全基线不在其中（由 core 写死，不可配置）。
 */
export interface AppSecurityPolicy {
  /** 允许加载的 Origin 列表；未列出的外部域名由平台决定导航去向 */
  allowedOrigins?: string[]
  allowNavigation?: boolean
  allowPopups?: boolean
  allowDownloads?: boolean
  allowClipboard?: boolean
  allowNotifications?: boolean
  allowFileAccess?: boolean
}
