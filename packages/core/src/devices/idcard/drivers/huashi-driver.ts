/* eslint-disable node/prefer-global/buffer */
/* eslint-disable node/prefer-global/process */
import type { BrandDriver, IdCardData } from '../types'
import type { KoffiFn, KoffiLib } from './koffi'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { idCardError } from '../errors'
import { requireKoffi } from './koffi'

/**
 * 华视电子身份证阅读器驱动（深圳华视 SDK V7.1.8，函数以《身份证阅读器SDK使用手册.doc》为准）。
 *
 * DLL（resources/devices/huashi/）：
 *   Termb.dll      主 API 动态库（入口）
 *   sdtapi.dll     安全模块通讯库
 *   WltRS.dll      照片解码库（SDK 运行时自行加载，本驱动不直接调用）
 *   DLL_File.dll   64 位依赖库
 *   license.dat    授权文件（解码必需，须与 DLL 同目录）
 *
 * 调用流程：
 *   CVR_InitComm(1001)        1001-1016 = USB；1-16 = 串口
 *        ↓
 *   CVR_Authenticate()        卡认证（阅读器 ↔ 身份证）
 *        ↓
 *   CVR_Read_Content(1)       读卡。active=1 全量；SDK 另向系统临时目录 %TEMP%\chinaidcard
 *                             落 wz.txt/xp.wlt/zp.bmp/fp.dat（手册明示路径固定不可改）——本驱动
 *                             不依赖这些文件，仅以其返回值判断成败
 *        ↓
 *   Getbase64JpgData         照片：内存直读 jpg base64（≤38862*2B），零落盘
 *        ↓
 *   GetPeopleNameU … GetEndDateU（9 个 U 版字段接口）
 *        ↓
 *   CVR_CloseComm()
 *
 * 关键事实：
 * - 用 U 版接口（UTF-16LE 出参 char* + int* 长度）：中文/生僻字支持比 GBK 版好
 * - 字段读取约定：返回 1 = 成功；缓冲区 512B 足够（姓名 ≤30B、地址 ≤70B）
 * - 读卡/取信息返回码：1=正确，0=读取失败，4=读卡器未连接，99=动态库未加载
 * - cwd 敏感：SDK 按 cwd 相对路径解析 license.dat（授权）与 WltRs.dll（照片解码），
 *   cwd 偏差会让照片解码静默失败（返回 1 但缓冲区空白）——故 open 会话期间 chdir 到 DLL 目录
 * - 照片源数据即 102×126（38862B BMP 上限可反推行宽），像素低是芯片存储标准，非获取缺陷
 * - 指纹（fp.dat）未实现，留扩展点
 *
 * PII 红线：读出的证件号/姓名/地址/照片不得写日志、不得持久化（照片全程内存直读，不落盘）。
 */

const FIELD_FNS: Array<[keyof IdCardData, string]> = [
  ['name', 'GetPeopleNameU'],
  ['gender', 'GetPeopleSexU'],
  ['nation', 'GetPeopleNationU'],
  ['birthDate', 'GetPeopleBirthdayU'],
  ['idNumber', 'GetPeopleIDCodeU'],
  ['address', 'GetPeopleAddressU'],
  ['issuer', 'GetDepartmentU'],
  ['validFrom', 'GetStartDateU'],
  ['validTo', 'GetEndDateU'],
]

/** 契约日期字段（统一格式 YYYY-MM-DD，见 IdCardData） */
const DATE_KEYS: ReadonlySet<string> = new Set(['birthDate', 'validFrom', 'validTo'])

/** 设备原始日期串（YYYYMMDD / YYYY.MM.DD 等）→ 契约统一格式 YYYY-MM-DD；"长期" 等非日期原样返回 */
function normalizeDate(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` : raw.trim()
}

/**
 * 华视驱动 —— "一个厂商 = 一个驱动类"：身份/DLL 位置/端口/行为全部内聚于此（实现 BrandDriver）。
 * 新增厂商 = drivers/ 加一个同类驱动 + dll-adapter 注册表加一行。
 */
export class HuashiDriver implements BrandDriver {
  // 显式 string 标注（放宽字面量收窄）：CVR 兼容贴牌驱动（科密等）子类覆写品牌/位置
  readonly brand: string = '华视'
  readonly displayName: string = '华视 CVR-100 证卡读卡器（USB）'
  /** DLL 相对宿主资源根的出厂位置 */
  readonly dllFile: string = 'devices/huashi/Termb.dll'
  /** 1001-1016 = USB；1-16 = 串口 */
  readonly port = 1001
  /** 进程级全局资源互斥：华视系 SDK 靠 chdir 找相邻资源，dll:huashi 与 dll:kemi 不得并发 open（科密子类继承同组） */
  readonly lockGroup = 'huashi'

  private readonly resourcesRoot: string
  private lib: KoffiLib | null = null
  private fns: Record<string, KoffiFn> = {}
  /** 读卡会话前的进程 cwd 暂存（open 时切到 DLL 目录，close 时恢复） */
  private prevCwd: string | null = null

  /** 宿主注入资源根；DLL 绝对路径走 getter（运行时求值 this.dllFile，CVR 兼容贴牌驱动子类覆写 dllFile 即复用全部流程） */
  constructor(resourcesRoot: string) {
    this.resourcesRoot = resourcesRoot
  }

  private get dllPath(): string {
    return path.join(this.resourcesRoot, this.dllFile)
  }

  dllPresent(): boolean {
    return existsSync(this.dllPath)
  }

  /** 懒加载：首次真正用设备时才 require koffi + LoadLibrary（缺依赖不影响服务启动） */
  private ensureLoaded(): void {
    if (this.lib) { return }
    if (!existsSync(this.dllPath)) {
      throw idCardError('DEVICE_OFFLINE', `华视 DLL 未就位: ${this.dllPath}`, { dllPath: this.dllPath })
    }
    // 运行时解析，避免构建期依赖 koffi（真机联调时 npm i koffi）
    this.lib = requireKoffi({ dllPath: this.dllPath }).load(this.dllPath)
    const f = this.lib.func.bind(this.lib)
    this.fns = {
      CVR_InitComm: f('int CVR_InitComm(int)'),
      CVR_Authenticate: f('int CVR_Authenticate()'),
      CVR_Read_Content: f('int CVR_Read_Content(int)'),
      CVR_CloseComm: f('int CVR_CloseComm()'),
      // 照片：jpg base64 内存直读（≤38862*2B），零落盘（手册函数列表）
      Getbase64JpgData: f('int Getbase64JpgData(char*, int*)'),
      ...Object.fromEntries(FIELD_FNS.map(([, name]) => [name, f(`int ${name}(char*, int*)`)])),
    }
  }

  /**
   * 打开连接（USB 端口 1001）。SDK 按 cwd 相对路径解析 license.dat 与 WltRS.dll，
   * Electron 的 cwd 不可控（真机实验：cwd 偏差 → 照片解码静默失败返回空载荷），
   * 故会话期间 chdir 到 DLL 目录；华视系（含科密）经 service 锁按 lockGroup 串行化，chdir 窗口无并发。
   */
  open(): void {
    this.ensureLoaded()
    this.prevCwd = process.cwd()
    try {
      const dllDir = path.dirname(this.dllPath)
      try {
        process.chdir(dllDir)
      }
      catch {
        throw idCardError('DEVICE_OFFLINE', '切换工作目录到 DLL 目录失败', { dllDir })
      }
      const r = this.fns.CVR_InitComm(this.port)
      if (r !== 1) {
        throw idCardError('DEVICE_OFFLINE', `打开华视读卡器失败（端口 ${this.port}，返回码 ${r}）`, { port: this.port, ret: r })
      }
    }
    catch (err) {
      this.restoreCwd()
      throw err
    }
  }

  /** 完整读卡：卡认证 → 读内容 → 照片（内存直读）→ 9 字段 */
  readCard(): IdCardData {
    this.ensureLoaded()
    const auth = this.fns.CVR_Authenticate()
    if (auth !== 1) {
      throw idCardError('READ_FAILED', '卡认证失败：请将身份证放置在读卡区', { stage: 'authenticate', ret: auth })
    }
    const read = this.fns.CVR_Read_Content(1)
    if (read !== 1) {
      // 手册返回码：4=读卡器未连接，0=读取失败
      if (read === 4) {
        throw idCardError('DEVICE_OFFLINE', '读卡器未连接', { stage: 'read_content', ret: read })
      }
      throw idCardError('READ_FAILED', `读取身份证内容失败（返回码 ${read}）`, { stage: 'read_content', ret: read })
    }
    const data = {} as IdCardData
    for (const [key, fnName] of FIELD_FNS) {
      const value = this.readUtf16(this.fns[fnName])
      data[key] = DATE_KEYS.has(key) ? normalizeDate(value) : value
    }
    data.photoDataUrl = this.readPhotoB64()
    return data
  }

  close(): void {
    try {
      this.fns?.CVR_CloseComm()
    }
    catch {
      /* 关闭失败静默：设备状态由下次 open 重建 */
    }
    this.restoreCwd()
  }

  /** 恢复读卡会话前的进程 cwd（close 必达，open 失败路径也走这里） */
  private restoreCwd(): void {
    if (!this.prevCwd) { return }
    try {
      process.chdir(this.prevCwd)
    }
    catch {
      /* 恢复失败静默：不影响读卡结果 */
    }
    this.prevCwd = null
  }

  /**
   * 照片：Getbase64JpgData 内存直读 jpg base64 → dataURL（手册：≤38862*2B），零落盘。
   * 长度出参（int*）在本 SDK 上不可靠（真机返回 NUL 载荷），故 NUL 扫描取载荷
   * （base64 字符集不含 NUL，与文本接口同风格）+ base64 合法性校验。
   */
  private readPhotoB64(): string | undefined {
    const buf = Buffer.alloc(38862 * 2)
    const r = this.fns.Getbase64JpgData(buf, Buffer.alloc(4))
    if (r !== 1) { return undefined }
    const end = buf.indexOf(0)
    const b64 = buf.toString('latin1', 0, end < 0 ? buf.length : end).trim()
    if (!/^[a-z0-9+/=\r\n]+$/i.test(b64)) { return undefined }
    return `data:image/jpeg;base64,${b64}`
  }

  /** U 版接口读取：UTF-16LE 出参 → JS 字符串 */
  private readUtf16(fn: KoffiFn): string {
    const buffer = Buffer.alloc(512)
    const length = Buffer.alloc(4)
    const r = fn(buffer, length)
    if (r !== 1) { return '' }
    return buffer.toString('utf16le').replace(/\0/g, '').trim()
  }
}
