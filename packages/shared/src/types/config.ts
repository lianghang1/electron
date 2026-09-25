import type { DesktopAppManifest } from './manifest'

/**
 * 桌面平台统一配置：bootstrap 的唯一配置入口，不散落在各 Service 里。
 * 注意：进程级安全基线（sandbox / contextIsolation / nodeIntegration）不在
 * 配置面里——它们由 core 写死为安全值，不可配置。
 */
export interface DesktopConfig {
  app: {
    /** AppUserModelId（Windows 任务栏分组），如 'com.company.desktop' */
    id: string
    name: string
    version: string
  }
  window: {
    /**
     * 平台语义层，只放所有形态通用的窗口项（保持精简）。
     * Electron 其余全部属性走 WindowOverrides.browserWindowOptions 透传，
     * 同名时逃生口覆盖此处的默认值——不要把 Electron 属性逐个搬上来。
     */
    /** 窗口标题，缺省用 app.name */
    title?: string
    width: number
    height: number
    minWidth?: number
    minHeight?: number
  }
  apps: {
    /** 是否允许接入第三方 App；第一阶段平台只跑 internal App */
    allowThirdParty: boolean
    /**
     * 内置 App 清单（第一阶段代码注册）。
     * 未来 AppRegistry 可从这里扩展到远程配置中心 / 企业应用中心 / 应用市场。
     */
    manifests?: DesktopAppManifest[]
  }
}
