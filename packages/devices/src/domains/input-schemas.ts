/**
 * 域方法入参 schema：运行时校验与 handler 入参类型的唯一事实源。
 * 危险写操作（写卡块号/数据、打印 URL/路径、采集请求）在此做范围与格式校验，
 * 其余可选字段 passthrough 保留，避免静默丢弃业务参数。
 */
import { z } from 'zod'

/** 12 位 hex 扇区密钥 / 32 位 hex 数据块（16 字节） */
const key12 = z.string().regex(/^[0-9a-f]{12}$/i, '密钥须为 12 位十六进制').optional()
const data32 = z.string().regex(/^[0-9a-f]{32}$/i, '数据须为 32 位十六进制（16 字节）')
const keyType = z.enum(['A', 'B']).optional()

/** 档案覆盖：现场仅可调白名单字段；形状与各域 DeviceOverrides 契约一致 */
const wsOverride = z.object({ url: z.string().optional() }).passthrough().optional()
const simpleOverride = z.object({
  id: z.string().optional(),
  displayName: z.string().optional(),
  ws: wsOverride,
}).passthrough()

const captureOverride = z.object({
  id: z.string().optional(),
  displayName: z.string().optional(),
  ws: z.object({
    url: z.string().optional(),
    camId: z.number().int().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    wake: z.object({ command: z.string().optional() }).passthrough().optional(),
  }).passthrough().optional(),
  service: z.object({
    baseUrl: z.string().optional(),
    listPath: z.string().optional(),
    capturePath: z.string().optional(),
  }).passthrough().optional(),
}).passthrough()

const scannerOverride = z.object({
  id: z.string().optional(),
  displayName: z.string().optional(),
  timeout: z.number().int().positive().optional(),
  minLength: z.number().int().nonnegative().optional(),
  endKey: z.string().optional(),
  prefixes: z.array(z.string()).optional(),
  requirePrefix: z.boolean().optional(),
  hidUrl: z.string().optional(),
}).passthrough()

/** setConfig 入参：档案锚点 id + 覆盖对象 */
export const idcardConfigInput = z.object({ id: z.string().min(1), overrides: simpleOverride })
export const iccardConfigInput = z.object({ id: z.string().min(1), overrides: simpleOverride })
export const captureConfigInput = z.object({ id: z.string().min(1), overrides: captureOverride })
export const signatureConfigInput = z.object({ id: z.string().min(1), overrides: simpleOverride })
export const scannerConfigInput = z.object({
  enabled: z.boolean(),
  activeId: z.string().min(1),
  deviceId: z.string().min(1),
  overrides: scannerOverride,
})

/** 打印请求：payload 判别联合 + options（paper 必填，其余原样保留交给驱动解析） */
export const printPayloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('file'), path: z.string().min(1).refine(p => !p.includes('\0'), '路径含非法字符') }),
  z.object({ kind: z.literal('url'), url: z.string().url(), fileType: z.enum(['pdf', 'image']).optional() }),
  z.object({ kind: z.literal('html'), html: z.string().min(1) }),
])
export const printSubmitInput = z.object({
  payload: printPayloadSchema,
  options: z.object({ paper: z.string() }).passthrough(),
})

/** 采集请求：可选设备/格式/分辨率，全部有界 */
export const captureRequestInput = z.object({
  deviceId: z.string().optional(),
  format: z.enum(['jpg', 'png', 'bmp']).optional(),
  resolutionNum: z.number().int().nonnegative().optional(),
}).passthrough()

/** IC 卡读写（deviceId 由域缺省补齐，此处可选透传） */
const cardDevice = z.string().optional()
export const iccardReadInput = z.object({
  deviceId: cardDevice,
  key: key12,
  keyType,
  sector: z.number().int().min(0).max(15).optional(),
}).passthrough()
export const iccardWriteInput = z.object({
  deviceId: cardDevice,
  block: z.number().int().min(0).max(63),
  data: data32,
  key: key12,
  keyType,
}).passthrough()
export const iccardWriteTextsInput = z.object({
  deviceId: cardDevice,
  sector: z.number().int().min(0).max(15),
  texts: z.array(z.string()).min(1).max(3),
  key: key12,
  keyType,
}).passthrough()

/** 身份证读取（deviceId 缺省时域内定位首个就绪设备） */
export const idcardReadInput = z.object({ deviceId: z.string().optional() })

/** 通用无参 / 单 id 入参 */
export const noInput = z.undefined().optional()
export const jobIdInput = z.object({ jobId: z.string().min(1) })
export const listJobsInput = z.object({ limit: z.number().int().positive().optional() }).optional()
export const nullableIdInput = z.object({ id: z.string().nullable() })
export const dataUrlInput = z.object({ dataUrl: z.string().min(1), ext: z.string().optional() })
export const simulateInput = z.object({ code: z.string().min(1) })
export const optionalDeviceInput = z.object({ deviceId: z.string().optional() }).passthrough()
export const requiredDeviceInput = z.object({ deviceId: z.string().min(1) })
