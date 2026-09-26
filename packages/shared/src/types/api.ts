import type { AppContext } from './context'
import type { DeviceIdCard, DevicePrintTicket } from './device'
import type {
  FhBusinessConfig,
  FhInvoice,
  FhInvoiceTitle,
  FhOrder,
  FhPaySession,
  FhPayStatus,
  FhQuery,
} from './funeral'
import type { HospitalBusinessConfig } from './hospital'
import type { DesktopIpc } from './ipc'
import type { DesktopAppManifest, RegisteredApp } from './manifest'
import type { AppPermissionState, Permission } from './permission'
import type { DesktopTab, OpenTabOptions, WorkAreaRect } from './tab'
/**
 * Renderer 可监听的平台推送事件：从契约中数组形态的 channel 自动推导，
 * 与 Main 侧 emit 保持单一来源。
 */
export type DesktopEvents = {
  [K in keyof DesktopIpc as DesktopIpc[K] extends unknown[] ? K : never]: (
    ...args: DesktopIpc[K] extends unknown[] ? DesktopIpc[K] : never
  ) => void
}

/**
 * window.desktop 桥的类型：Preload 按它实现，Renderer 按它消费。
 * 每个分组对应一类平台服务；权限 / 存储等敏感能力的实际授权都在 Main。
 */
export interface DesktopApi {
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    restore: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
  }
  app: {
    list: () => Promise<RegisteredApp[]>
    getManifest: (appId: string) => Promise<DesktopAppManifest | undefined>
    getCurrent: () => Promise<AppContext>
  }
  tabs: {
    list: () => Promise<DesktopTab[]>
    open: (options: OpenTabOptions) => Promise<DesktopTab>
    close: (tabId: string) => Promise<void>
    activate: (tabId: string) => Promise<void>
    reload: (tabId: string) => Promise<void>
    setWorkArea: (rect: WorkAreaRect) => Promise<void>
  }
  permission: {
    check: (permission: Permission) => Promise<boolean>
    /** 对运行时权限请求做出用户决策 */
    respond: (requestId: string, granted: boolean) => Promise<void>
    /** App 权限状态列表（声明 + 运行时决策合成视图） */
    list: (appId: string) => Promise<AppPermissionState[]>
  }
  storage: {
    get: <T>(key: string) => Promise<T | undefined>
    set: <T>(key: string, value: T) => Promise<void>
    remove: (key: string) => Promise<void>
    /** 清空调用者 App 的全部本地存储 */
    clear: () => Promise<void>
  }
  update: {
    /** 手动触发检查更新 */
    check: () => Promise<void>
    /** 下载完成后重启安装 */
    install: () => Promise<void>
  }
  /** 通用外设通道（handler 在 app 侧注册，各 Kiosk App 复用） */
  device: {
    /** 读身份证/就诊卡，无卡时返回 null */
    readIdCard: () => Promise<DeviceIdCard | null>
    /** 打印票据 */
    print: (ticket: DevicePrintTicket) => Promise<void>
  }
  /** App 自有业务通道（单应用形态，handler 在 app 侧注册） */
  hospital: {
    /** 业务配置（userData/config.json 覆盖后的合成值） */
    getConfig: () => Promise<HospitalBusinessConfig>
  }
  /** 殡仪馆自助终端业务通道（handler 在 app 侧注册） */
  funeral: {
    /** 业务配置（userData/config.json 覆盖后的合成值） */
    getConfig: () => Promise<FhBusinessConfig>
    /** 按业务单条码或身份证查询业务单（代收费） */
    queryOrders: (query: FhQuery) => Promise<FhOrder[]>
    /** 创建支付会话（返回二维码内容与有效期） */
    createPay: (orderNo: string) => Promise<FhPaySession>
    /** 轮询支付状态 */
    payStatus: (orderNo: string) => Promise<FhPayStatus>
    /** 按业务单条码或身份证查询已开发票 */
    listInvoices: (query: FhQuery) => Promise<FhInvoice[]>
    /** 为业务单开发票 */
    issueInvoice: (input: { orderNo: string, title: FhInvoiceTitle }) => Promise<FhInvoice>
  }
  events: {
    /** 监听平台推送事件，返回取消监听函数 */
    on: <K extends keyof DesktopEvents>(channel: K, listener: DesktopEvents[K]) => () => void
  }
}
