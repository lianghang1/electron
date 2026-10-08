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

export interface IdReaderResult {
  ok: boolean
  data?: IdCardData
  meta?: Record<string, unknown>
  error?: { code: IdReaderErrorCode, message: string, detail?: unknown }
}

export type IdReaderErrorCode
  = | 'DEVICE_NOT_FOUND'
    | 'DEVICE_OFFLINE'
    | 'READ_FAILED'
    | 'ADAPTER_UNAVAILABLE'
    | 'VALIDATION_FAILED'
    | 'UNKNOWN'
