import type { IcCardReadRequest, IcCardReadResult, IcCardTextsWriteRequest, IcCardWriteRequest, IdReaderDevice } from '../../devices/iccard'
import { invoke } from '../../../domain'

/**
 * iccard 域 · M1 IC 卡读写（Mifare Classic）。
 * 与 idcard（身份证）平级的独立原子域：卡型与操作语义不同（读写业务数据 vs 只读 PII），
 * 禁止合并。listReaders 仅返回具备 IC 卡能力的读卡器。
 *
 * 异常契约：失败 reject（IpcRemoteError，code 见 IcCardErrorCode），
 * 渲染层 try/catch 按错误码分支。
 */
export const iccardDomainDefs = {
  /** 列出 IC 卡读卡器（仅具备 IC 卡能力的读卡器，capabilities 区分是否支持写卡） */
  listReaders: invoke<() => Promise<IdReaderDevice[]>>(),
  /**
   * 读 M1 IC 卡一个扇区（寻卡 → 防碰撞 → 选卡 → 密钥认证 → 读块）。
   * 返回原始块数据 + 字符串组 texts（数据块按 0x00 截断解码为 UTF-8、尾部空块不返回，
   * 与 writeIcCardTexts 的 texts 互逆）。
   * deviceId 缺省时自动选用第一个就绪的读卡器；
   * key/keyType/sector 缺省 = 出厂白键 A 键读 1 扇区。
   */
  readIcCard: invoke<(req?: IcCardReadRequest & { deviceId?: string }) => Promise<IcCardReadResult>>(),
  /**
   * 写一个 M1 IC 卡数据块（寻卡 → 认证 → 写块）。
   * deviceId 缺省时自动选用第一个支持写卡且就绪的读卡器；
   * 危险操作：驱动强制拒绝密钥控制块与厂商块，业务数据块照写不校验内容。
   */
  writeIcCard: invoke<(req: IcCardWriteRequest & { deviceId?: string }) => Promise<void>>(),
  /**
   * 写一个扇区的字符串组：texts 按序占用扇区数据块（UTF-8、0x00 结尾补齐 16 字节），未占用数据块清零。
   * 约束见 IcCardTextsWriteRequest；deviceId 缺省时自动选用第一个支持写卡且就绪的读卡器。
   */
  writeIcCardTexts: invoke<(req: IcCardTextsWriteRequest & { deviceId?: string }) => Promise<void>>(),
}
