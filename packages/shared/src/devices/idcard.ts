/**
 * idcard 域统一契约 —— 身份证阅读器。
 * 与 print/capture/iccard 平级的独立原子模块。不与 capture 合并的理由：
 * 产出物不同（结构化 PII 数据 vs 图片文件），合规约束不同（PII 禁日志、即用即弃、脱敏）。
 */

/** 读卡器接入方式（idcard/iccard 两域共用同一硬件描述形态） */
export type IdReaderTransport = 'dll' | 'service' | 'stub' | 'ws'

/** 档案公共段：档案 id / 名称 / 厂商（idcard 域 ws/dll 两路线共用） */
interface IdcardProfileBase {
  id: string
  displayName: string
  /** 厂商标识（面板展示用） */
  brand: string
}

/**
 * 设备档案（多设备档案制，与 capture 同构）：
 * - ws 路线：一条档案 = 一条 CamSDKServer 本地服务连接（服务下全部读卡器经该连接枚举）；
 * - dll 路线：一条档案 = 一个设备守护进程驱动注册表驱动（档案 id = 驱动名，见 host/run.ts），
 *   运行时设备 id = "dll:<档案 id>"，DLL 由守护进程按注册表自动加载。
 */
export interface IdcardWsProfile extends IdcardProfileBase {
  transport: 'ws'
  /** ws 连接参数 */
  ws: { url: string }
}

export interface IdcardDllProfile extends IdcardProfileBase {
  transport: 'dll'
}

export type IdcardDeviceConfig = IdcardWsProfile | IdcardDllProfile

/**
 * 现场可调白名单（持久化与界面提交的唯一形状）：名称 + ws 地址。
 * 档案清单与全部技术字段（品牌/接入方式/驱动）由代码出厂预设锁死，本地存储仅覆盖白名单字段。
 */
export interface IdcardDeviceOverrides {
  /** 档案锚点：持久化列表按 id 与出厂档案对位；IPC 提交时由通道参数携带，字段内可缺省 */
  id?: string
  displayName?: string
  ws?: { url?: string }
}

/** idcard 域配置 = ws 路线设备档案列表（持久化 device-idcard.json 根对象 { devices: [...] }） */
export type IdcardConfig = IdcardDeviceConfig[]

/** 读卡器设备描述（idcard/iccard 域的 listReaders 共用；capabilities 标签按域声明） */
export interface IdReaderDevice {
  /** "<transport>:<驱动名>"，如 "dll:huashi"（约定全系统同构） */
  id: string
  displayName: string
  brand: string
  transport: IdReaderTransport
  status: 'ready' | 'offline' | 'unavailable'
  /** 能力标签（驱动按已实现方法自动声明）：'idcard' = 身份证，'iccard' = M1 IC 卡读，'iccard-write' = M1 IC 卡写 */
  capabilities: string[]
  meta: Record<string, unknown>
}

/** 读取出的结构化身份数据 —— PII：严禁写入日志/持久化，用完即弃 */
export interface IdCardData {
  /** 姓名 */
  name: string
  /** 公民身份号码 */
  idNumber: string
  /** 性别 */
  gender: string
  /** 民族 */
  nation: string
  /** 出生日期，统一格式 YYYY-MM-DD（由驱动归一化） */
  birthDate: string
  /** 住址 */
  address: string
  /** 签发机关 */
  issuer: string
  /** 有效期起，统一格式 YYYY-MM-DD（由驱动归一化） */
  validFrom: string
  /** 有效期止，统一格式 YYYY-MM-DD；长期有效为 "长期"（由驱动归一化） */
  validTo: string
  /** 证件照片 dataURL（JPEG base64，可选） */
  photoDataUrl?: string
}

/**
 * 身份证读卡错误码：失败以异常跨 IPC 传递（IpcRemoteError.code），渲染层按码分支。
 * PII 红线：错误消息不得携带证件号/照片。
 */
export type IdReaderErrorCode
  = | 'DEVICE_NOT_FOUND'
    | 'DEVICE_OFFLINE'
    | 'READ_FAILED'
    | 'ADAPTER_UNAVAILABLE'
    | 'VALIDATION_FAILED'
    | 'UNKNOWN'
