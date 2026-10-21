/**
 * scanner 模块统一契约 —— 扫码枪（第四设备域：产出条码字符串）。
 * 扫码枪在 Windows 上是 HID 键盘仿真设备（无驱动无 DLL）：
 * 高速连击字符 + 结束键（默认 Enter），与真人打字的区别靠"节奏 + 长度"判定。
 */

export interface ScanResult {
  /** 完整条码（含前缀） */
  code: string
  /** 命中的前缀（如 "PB:"），未配置/未命中为 null */
  prefix: string | null
  /** 去掉前缀后的原始码 */
  rawCode: string
  timestamp: number
}

export interface ScanOptions {
  /** 无后续按键多久判定一次缓冲结束（ms），默认 100——扫码枪连击间隔远小于人打字 */
  timeout?: number
  /** 最小条码长度，默认 4（过滤误触） */
  minLength?: number
  /** 结束键，默认 Enter（多数扫码枪可配置追加回车） */
  endKey?: string
  /** 前缀列表（部分业务用前缀区分单据类型），命中后结果带 prefix */
  prefixes?: string[]
  /** 强制要求前缀命中才算有效扫码 */
  requirePrefix?: boolean
}

/** 扫码接入通道：keyboard = 键盘仿真（本机直连枪），hid = 厂商本地服务 HID 通道（如 CamSDKServer） */
export type ScannerChannelMode = 'keyboard' | 'hid'

/**
 * 扫码枪设备档案（多设备档案制）：一把枪一份接入参数。
 * transport = keyboard 时节奏/结束键/前缀即该枪的识别参数；transport = hid 时经 hidUrl 连厂商本地服务。
 * 档案清单与技术字段（品牌/通道）由代码出厂预设锁死，现场仅白名单字段可调（见 ScannerDeviceOverrides）。
 */
export interface ScannerDeviceConfig extends Required<ScanOptions> {
  /** 档案 id（激活切换以 id 为准） */
  id: string
  displayName: string
  /** 厂商标识（面板展示用） */
  brand: string
  transport: ScannerChannelMode
  /** transport='hid' 时的厂商本地服务地址（keyboard 档案不填） */
  hidUrl?: string
}

/**
 * 现场可调白名单（持久化与界面提交的唯一形状）：名称 + 节奏参数 + HID 服务地址。
 * 档案清单、品牌、通道由代码出厂预设锁死，本地存储仅覆盖白名单字段。
 */
export interface ScannerDeviceOverrides {
  /** 档案锚点：持久化列表按 id 与出厂档案对位；IPC 提交时由通道参数携带，字段内可缺省 */
  id?: string
  displayName?: string
  timeout?: number
  minLength?: number
  endKey?: string
  prefixes?: string[]
  requirePrefix?: boolean
  hidUrl?: string
}

/** scanner 域配置（只读视图：出厂预设 + 现场白名单覆盖合并后的全量档案） */
export interface ScannerConfig {
  /** 总开关：关闭后键盘事件不再进入缓冲器（扫码枪变普通键盘） */
  enabled: boolean
  /** 当前生效档案 id（决定接入通道与节奏参数；指向不存在档案时回落第一个档案） */
  activeId: string
  /** 设备档案列表 */
  devices: ScannerDeviceConfig[]
}

/** scanner 域持久化形状：域级开关 + 激活指向 + 档案白名单覆盖列表（档案清单代码锁死） */
export interface ScannerOverrides {
  enabled: boolean
  activeId: string
  devices: ScannerDeviceOverrides[]
}

/** scanner 域配置提交（IPC 入参）：域级开关/激活指向 + 单档案白名单覆盖 */
export interface ScannerSetInput {
  enabled: boolean
  activeId: string
  /** 待覆盖的档案 id（必须为出厂预设项） */
  deviceId: string
  overrides: ScannerDeviceOverrides
}

/** 扫码通道运行状态（statusUpdated 推送，供测试页/诊断展示） */
export interface ScannerStatus {
  mode: ScannerChannelMode
  /** HID 通道：与本地服务的连接是否就绪（keyboard 模式恒 true） */
  connected: boolean
  /** HID 通道：条码枪设备 SN（开启扫描 ACK 时上报） */
  devSN?: string
  /** 不可用原因等提示 */
  note?: string
}

export type ScannerLogFn = (
  level: 'info' | 'warn' | 'error',
  message: string,
  meta?: Record<string, unknown>,
) => void

export type ScanErrorCode = 'VALIDATION_FAILED' | 'UNKNOWN'
