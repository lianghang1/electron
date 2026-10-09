import type { IcCardReadRequest, IcCardWriteRequest, IcCardWriteResult, IcReaderResult, IdReaderDevice, IdReaderResult } from '../../devices/idcard'
import { invoke } from '../../../domain'

/**
 * 设备域 · 证卡读取切片（身份证阅读器 / IC 读卡器）。
 * 与 print / capture 平级的独立原子模块（按设备类型一文件，device 域聚合）。
 * 不与 capture 合并的理由：产出物不同（结构化 PII 数据 vs 图片文件），
 * 合规约束不同（PII 禁日志、即用即弃、脱敏）。
 */
export const idCardDomainDefs = {
  /** 列出全部读卡器（真实硬件优先，mock 兜底；capabilities 声明各驱动支持的卡型） */
  listReaders: invoke<() => Promise<{ ok: true, readers: IdReaderDevice[] } | { ok: false, error: { code: string, message: string } }>>(),
  /**
   * 读一张身份证（打开 → 认证 → 读取 → 关闭全程锁定）。
   * deviceId 缺省时平台自动选用第一个支持身份证且就绪的读卡器；
   * 永不 reject，失败经返回值 error 字段回传（错误码见 IdReaderErrorCode）。
   */
  readIdCard: invoke<(req?: { deviceId?: string }) => IdReaderResult>(),
  /**
   * 读一张 M1 IC 卡（寻卡 → 防碰撞 → 选卡 → 密钥认证 → 读块）。
   * deviceId 缺省时自动选用第一个支持 IC 卡且就绪的读卡器；
   * key/keyType/sector 缺省 = 出厂白键 A 键读 1 扇区；
   * 永不 reject，失败经返回值 error 字段回传（错误码见 IdReaderErrorCode）。
   */
  readIcCard: invoke<(req?: IcCardReadRequest & { deviceId?: string }) => IcReaderResult>(),
  /**
   * 写一个 M1 IC 卡数据块（寻卡 → 认证 → 写块）。
   * deviceId 缺省时自动选用第一个支持 IC 卡写且就绪的读卡器；
   * 危险操作：驱动强制拒绝密钥控制块与厂商块，业务数据块照写不校验内容；
   * 永不 reject，失败经返回值 error 字段回传（错误码见 IdReaderErrorCode）。
   */
  writeIcCard: invoke<(req: IcCardWriteRequest & { deviceId?: string }) => IcCardWriteResult>(),
}
