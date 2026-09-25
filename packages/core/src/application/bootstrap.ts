import type { BootstrapOptions } from '../types'
import { DesktopApplication } from './desktop-application'

/**
 * 应用启动入口：装配平台 Service → 注册 IPC → 创建窗口 → 管理生命周期。
 * app 的 electron/main/index.ts 只需要调用它并传入 DesktopConfig + 差异项。
 */
export function bootstrap(options: BootstrapOptions): void {
  new DesktopApplication(options).start()
}
