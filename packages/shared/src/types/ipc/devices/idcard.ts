import type { IcCardData, IcCardReadRequest, IcCardTextsWriteRequest, IcCardWriteRequest, IdCardData, IdReaderDevice } from '../../devices/idcard'
import { invoke } from '../../../domain'

/**
 * 设备域 · 证卡读取切片（身份证阅读器 / IC 读卡器）。
 * 与 print / capture 平级的独立原子模块（按设备类型一文件，device 域聚合）。
 * 不与 capture 合并的理由：产出物不同（结构化 PII 数据 vs 图片文件），
 * 合规约束不同（PII 禁日志、即用即弃、脱敏）。
 *
 * 异常契约：失败 reject（IpcRemoteError，code 见 IdReaderErrorCode），
 * 渲染层 try/catch 按错误码分支。
 */
export const idCardDomainDefs = {
  /** 列出全部读卡器（真实硬件优先，mock 兜底；capabilities 声明各驱动支持的卡型） */
  listReaders: invoke<() => Promise<IdReaderDevice[]>>(),
  /**
   * 读一张身份证（打开 → 认证 → 读取 → 关闭全程锁定）。
   * deviceId 缺省时平台自动选用第一个支持身份证且就绪的读卡器。
   */
  readIdCard: invoke<(req?: { deviceId?: string }) => Promise<IdCardData>>(),
  /**
   * 读一张 M1 IC 卡（寻卡 → 防碰撞 → 选卡 → 密钥认证 → 读块）。
   * deviceId 缺省时自动选用第一个支持 IC 卡且就绪的读卡器；
   * key/keyType/sector 缺省 = 出厂白键 A 键读 1 扇区。
   */
  readIcCard: invoke<(req?: IcCardReadRequest & { deviceId?: string }) => Promise<IcCardData>>(),
  /**
   * 写一个 M1 IC 卡数据块（寻卡 → 认证 → 写块）。
   * deviceId 缺省时自动选用第一个支持 IC 卡写且就绪的读卡器；
   * 危险操作：驱动强制拒绝密钥控制块与厂商块，业务数据块照写不校验内容。
   */
  writeIcCard: invoke<(req: IcCardWriteRequest & { deviceId?: string }) => Promise<void>>(),
  /**
   * 读一个扇区的字符串组：扇区数据块按 0x00 截断解码为 UTF-8 文本，尾部空块不返回。
   * 与 writeIcCardTexts 互逆：写入 ["1","2","1051851"] 后读取返回原数组；
   * deviceId 缺省时自动选用第一个支持 IC 卡且就绪的读卡器。
   */
  readIcCardTexts: invoke<(req?: IcCardReadRequest & { deviceId?: string }) => Promise<string[]>>(),
  /**
   * 写一个扇区的字符串组：texts 按序占用扇区数据块（UTF-8、0x00 结尾补齐 16 字节），未占用数据块清零。
   * 约束见 IcCardTextsWriteRequest；deviceId 缺省时自动选用第一个支持写卡且就绪的读卡器。
   */
  writeIcCardTexts: invoke<(req: IcCardTextsWriteRequest & { deviceId?: string }) => Promise<void>>(),
}
