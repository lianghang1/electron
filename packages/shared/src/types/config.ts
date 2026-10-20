import type { DesktopAppManifest } from './manifest'
import type { Permission } from './permission'
import type { UpdateAsarSource } from './update'

/**
 * 桌面平台统一配置：bootstrap 的唯一配置入口，不散落在各 Service 里。
 * 注意：进程级安全基线（sandbox / contextIsolation / nodeIntegration）不在
 * 配置面里——它们由 core 写死为安全值，不可配置。
 */
export interface DesktopConfig {
  app: {
    /** AppUserModelId（Windows 任务栏分组），如 'com.company.desktop'；单实例锁 / 分区 scope / 协议源等运行时身份均由此派生 */
    id: string
    /** 英文产品名（对应 identity.productName）：内部标识场景使用，不面向用户展示 */
    name: string
    /** 面向用户的显示名（对应 identity.displayName）：窗口标题缺省与 Shell 品牌区等界面显示使用 */
    displayName: string
    version: string
  }
  window: {
    /**
     * 平台语义层，只放所有形态通用的窗口项（保持精简）。
     * Electron 其余全部属性走 WindowOverrides.browserWindowOptions 透传，
     * 同名时逃生口覆盖此处的默认值——不要把 Electron 属性逐个搬上来。
     */
    /** 窗口标题，缺省用 app.displayName */
    title?: string
    width: number
    height: number
    minWidth?: number
    minHeight?: number
  }
  /**
   * 单站直嵌形态：整个应用就是一个网页（定制壳最常见交付形态），启动自动打开为固定主 Tab。
   * 与 apps 互斥（同时配置启动期报错）；要承载多 App / 混合形态改用 apps.manifests。
   * manifest 的其余字段（name/version/type）全部无需关心：注册表按 resource 形态自动兜底
   * （名称缺省取 URL 域名，仅多资源 Tab 标题会显示）。
   */
  entry?: {
    /** 直嵌内容的分区标识（cookie 隔离与 Tab 实例键），缺省派生 app.id（打包身份，跨版本稳定） */
    id?: string
    /** 直嵌网页地址 */
    url: string
    /** 平台权限放行清单，缺省 ['storage']（登录态持久化刚需） */
    permissions?: Permission[]
  }
  /**
   * 多 App 平台形态的内容承载：常规 App + 资源直嵌混配。
   * 与 entry 互斥（同时配置启动期报错）；单站直嵌 / 无清单形态（Kiosk 自渲染）缺省本块。
   */
  apps?: {
    /** 是否允许接入第三方 App； */
    allowThirdParty?: boolean
    /** 内置 App 清单（代码注册，保底、优先）；kind: 'resource' 条目为资源直嵌（启动自动打开） */
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
    /**
     * 系统托盘（默认 false）。开启后用户关闭主窗 = 最小化到托盘（隐藏不销毁），
     * 托盘菜单「退出」才真正结束进程；不开启则保持「关窗即退出」
     */
    tray?: boolean
  }
  /** 下载行为：默认静默保存到系统下载目录（Kiosk 无人值守友好） */
  download?: {
    /** 每次下载弹系统另存对话框让用户选目录（桌面形态可开）；默认 false */
    saveAs?: boolean
  }
  /** 业务产物文件（filesDir 之下：拍照 / 打印 / 签名）的保留策略 */
  files?: {
    /**
     * 产物保留天数：按文件修改时间计算（产物落盘后不再改动，mtime 即产生时间），
     * 启动时清理过期文件；缺省 7，0 或负数视为关闭清理
     */
    retentionDays?: number
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
