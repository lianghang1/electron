import type { DesktopAppManifest } from './manifest'
import type { UpdateAsarSource } from './update'

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
    /** 内置 App 清单（代码注册，保底、优先） */
    manifests?: DesktopAppManifest[]
    /**
     * 远程 App 清单源（HTTP URL，返回 DesktopAppManifest 数组）。
     * 异步拉取、失败静默跳过，与代码注册 / apps.json 共用冲突策略（代码注册优先）。
     * 仅当 origin 命中 remoteOrigins 白名单时才会真正拉取。
     */
    remoteUrl?: string
    /**
     * 远程清单源的 origin 白名单（如 'https://apps.company.com'）。
     * 平台安全基线：不配置 = 远程源整体禁用；配置后 remoteUrl 的 origin
     * 必须精确命中（含协议与端口），否则拒绝拉取。显式信任语义，协议不再二次限制。
     */
    remoteOrigins?: string[]
  }
  /** 平台能力开关：单应用形态（如 Kiosk）可关闭 Tab 体系，避免初始化无用服务 */
  features?: {
    /** Tab 多应用承载体系（默认 true）。关闭后 tabs:* IPC 通道不注册、Tab/App/Web 服务不实例化 */
    tabs?: boolean
  }
  /** 下载行为：默认静默保存到系统下载目录（Kiosk 无人值守友好） */
  download?: {
    /** 每次下载弹系统另存对话框让用户选目录（桌面形态可开）；默认 false */
    saveAs?: boolean
  }
  /** 自动更新：不配置 url 则更新体系整体关闭 */
  updates?: {
    /** 更新服务器地址（latest.yml 所在目录，整包更新 electron-updater 用；asar 清单相对它解析） */
    url: string
    /**
     * asar 热更源：字符串 = 原生清单文件地址（相对 url 解析，也可绝对地址）；
     * 对象 = 后端判断接口适配器（endpoint 拉取响应，transform 适配为内部清单 UpdateManifest）。
     * 后端接口格式变化只改 transform（位于 electron/main，随热更下发），core 链路零改动。
     * 不配置则关闭 asar 热更。下载校验通过后写 pending 标记，重启应用由引导器完成替换。
     */
    asar?: string | UpdateAsarSource
  }
  /**
   * 运行韧性：自助机（Kiosk）等无人值守场景的平台级行为，默认全关。
   * Desktop 等有人值守形态不需要配置。
   */
  resilience?: {
    /**
     * 渲染进程崩溃自动重载：指数退避（1s 起步，上限 30s），
     * 60s 内连续崩溃超过 5 次熔断停止重载并告警，防崩溃死循环
     */
    crashReload?: boolean
    /** 开机自启（系统登录项）：仅生产环境生效，dev 挂的是 electron.exe 无意义 */
    autoLaunch?: boolean
    /**
     * 防退出：拦截用户发起的窗口关闭（Alt+F4 等）；app.quit()（更新安装、代码退出）不受影响。
     * 任务管理器结束进程是自助机部署的最后兜底
     */
    exitGuard?: boolean
    /**
     * 定时重启（无人值守长跑标配）：每天指定时刻重启进程，动作按更新状态择优——
     * 有热更 pending → 重启即生效；有已下载整包 → 退出并安装；都没有 → 纯重启释放内存。
     * 同一天只触发一次，休眠/关机跨过时刻则跳过当天
     */
    scheduledRestart?: {
      /** 24 小时制小时（0-23），默认 3（凌晨） */
      hour?: number
      /** 分钟（0-59），默认 0 */
      minute?: number
    }
  }
}
