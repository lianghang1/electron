/**
 * idcard 模块统一契约 —— 证卡读取域（身份证阅读器/IC 读卡器）。
 * 与 print/capture 平级的独立原子模块。不与 capture 合并的理由：
 * 产出物不同（结构化 PII 数据 vs 图片文件），合规约束不同（PII 禁日志、即用即弃、脱敏）。
 */

export type IdReaderTransport = 'dll' | 'service' | 'stub'

export interface IdReaderDevice {
  /** "<transport>:<驱动名>"，如 "dll:huashi"、"stub:reader"（约定全系统同构） */
  id: string
  displayName: string
  brand: string
  transport: IdReaderTransport
  status: 'ready' | 'offline' | 'unavailable'
  /** 能力标签（驱动按已实现方法自动声明）：'idcard' = 身份证，'iccard' = M1 IC 卡 */
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
 * 读卡错误码：失败以异常跨 IPC 传递（IpcRemoteError.code），渲染层按码分支。
 * PII 红线：错误消息不得携带证件号/照片。
 */
export type IdReaderErrorCode
  = | 'DEVICE_NOT_FOUND'
    | 'DEVICE_OFFLINE'
    | 'READ_FAILED'
    /** IC 卡写块失败 */
    | 'WRITE_FAILED'
    | 'ADAPTER_UNAVAILABLE'
    | 'VALIDATION_FAILED'
    | 'UNKNOWN'

/** M1 IC 卡读取参数：缺省出厂白键（A 键）读 1 扇区数据块 */
export interface IcCardReadRequest {
  /** 扇区密钥（12 位 hex），缺省 FFFFFFFFFFFF 出厂白键 */
  key?: string
  /** 密钥类型，缺省 A */
  keyType?: 'A' | 'B'
  /** 扇区号 0-15，缺省 1（0 扇区为厂商块，通常无业务数据） */
  sector?: number
}

/** IC 卡数据 —— 卡 UID + 扇区块数据；业务数据按敏感数据处理，禁止写日志 */
export interface IcCardData {
  /** 卡序列号 UID（大写 hex） */
  uid: string
  /** 卡类型代码（ATQA，4 位 hex） */
  cardType?: string
  /** 读出的数据块：键 = 绝对块地址（扇区号×4 起），值 = 32 位 hex（16 字节）；密钥控制块（每扇区末块）不回读 */
  blocks: Record<number, string>
}

/** M1 IC 卡写入参数：按绝对块地址写 16 字节数据 */
export interface IcCardWriteRequest {
  /** 绝对块地址 0-63（Mifare Classic 1K）；驱动强制拒绝密钥控制块（每扇区末块）与 0 扇区 0 块（厂商块） */
  block: number
  /** 写入数据：32 位 hex（16 字节） */
  data: string
  /** 扇区密钥（12 位 hex），缺省出厂白键 */
  key?: string
  /** 密钥类型，缺省 A */
  keyType?: 'A' | 'B'
}
