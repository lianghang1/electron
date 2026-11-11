/**
 * iccard 域统一契约 —— M1 IC 卡读卡器（Mifare Classic 读/写）。
 * 与 idcard（身份证）平级的独立原子域：卡型、操作语义（读写 vs 只读 PII）、
 * 合规约束（业务数据 vs 证件敏感信息）均不同，禁止合并。
 * 读卡器硬件描述与 idcard 域共用同一结构（同一批读卡器硬件，capabilities 区分卡能力），
 * iccard 域以 IcReaderDevice 语义别名引用，避免身份证域命名出现在本域契约中。
 */
import type { IdReaderDevice, IdReaderTransport } from './idcard'

/** 读卡器硬件描述（= idcard 域 IdReaderDevice，结构共用） */
export type IcReaderDevice = IdReaderDevice

export type { IdReaderTransport }

/** 档案公共段：档案 id / 名称 / 厂商（iccard 域 ws/dll 两路线共用） */
interface IcReaderProfileBase {
  id: string
  displayName: string
  /** 厂商标识（面板展示用） */
  brand: string
}

/**
 * 设备档案（多设备档案制，与 capture/idcard 同构）：
 * - dll 路线：一条档案 = 一个设备守护进程驱动注册表驱动（档案 id = 驱动名，见 host/run.ts），
 *   运行时设备 id = "dll:<档案 id>"，DLL 由守护进程按注册表自动加载；
 * - ws 路线：一条档案 = 一条读卡器本地服务连接。
 * 当前版本 ws 路线协议暂未接入：档案可管理，对应设备在测试页显示为「未接入」（missing）。
 */
export interface IcReaderDllProfile extends IcReaderProfileBase {
  transport: 'dll'
}

export interface IcReaderWsProfile extends IcReaderProfileBase {
  transport: 'ws'
  /** ws 连接参数 */
  ws: { url: string }
}

export type IcReaderDeviceConfig = IcReaderDllProfile | IcReaderWsProfile

/**
 * 现场可调白名单（持久化与界面提交的唯一形状）：名称 + ws 地址。
 * 档案清单与全部技术字段（品牌/接入方式/驱动）由代码出厂预设锁死，本地存储仅覆盖白名单字段。
 */
export interface IccardDeviceOverrides {
  /** 档案锚点：持久化列表按 id 与出厂档案对位；IPC 提交时由通道参数携带，字段内可缺省 */
  id?: string
  displayName?: string
  ws?: { url?: string }
}

/** iccard 域配置 = 设备档案列表（持久化 device-iccard.json 根对象 { devices: [...] }） */
export type IccardConfig = IcReaderDeviceConfig[]

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
  /** 十进制卡号：UID 4 字节按小端整数转十进制（门禁/一卡通系统常见卡号形态，与 hex UID 为同一序列号的两种展示） */
  cardNumber?: string
  /** 卡类型代码（ATQA，4 位 hex） */
  cardType?: string
  /** 读出的数据块：键 = 绝对块地址（扇区号×4 起），值 = 32 位 hex（16 字节）；密钥控制块（每扇区末块）不回读 */
  blocks: Record<number, string>
}

/** 扇区数据块按 0x00 截断解码为 UTF-8 文本、尾部空块不返回（与 writeIcCardTexts 的 texts 互逆） */
export type IcCardReadResult = IcCardData & { texts: string[] }

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

/**
 * M1 IC 卡扇区级字符串组写入参数（writeIcCardTexts）：
 * texts 按序占用扇区数据块（UTF-8 编码、0x00 结尾补齐 16 字节），未占用的数据块清零。
 * 与 readIcCard 返回的 texts 互逆：写入 ["1","2","1051851"] 后读取返回原数组。
 */
export interface IcCardTextsWriteRequest {
  /** 扇区号 0-15（0 扇区首块为厂商块，写入会被驱动拒绝，业务数据用 1-15） */
  sector: number
  /** 字符串组：每项 UTF-8 编码 ≤ 16 字节且不含 0x00；最多 3 项（M1 每扇区数据块数） */
  texts: string[]
  /** 扇区密钥（12 位 hex），缺省出厂白键 */
  key?: string
  /** 密钥类型，缺省 A */
  keyType?: 'A' | 'B'
}

/**
 * IC 卡读写错误码：失败以异常跨 IPC 传递（IpcRemoteError.code），渲染层按码分支。
 * 与 IdReaderErrorCode 的差异：多 WRITE_FAILED（写卡失败），错误消息不得携带卡数据。
 */
export type IcCardErrorCode
  = | 'DEVICE_NOT_FOUND'
    | 'DEVICE_OFFLINE'
    | 'READ_FAILED'
    /** IC 卡写块失败 */
    | 'WRITE_FAILED'
    | 'CHANNEL_UNAVAILABLE'
    | 'VALIDATION_FAILED'
    | 'UNKNOWN'
