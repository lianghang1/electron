import type { IdReaderDevice, IdReaderResult } from '../../devices/idcard'
import { invoke } from '../../../domain'

/**
 * 设备域 · 证卡读取切片（身份证阅读器 / IC 读卡器）。
 * 与 print / capture 平级的独立原子模块（按设备类型一文件，device 域聚合）。
 * 不与 capture 合并的理由：产出物不同（结构化 PII 数据 vs 图片文件），
 * 合规约束不同（PII 禁日志、即用即弃、脱敏）。
 */
export const idCardDomainDefs = {
  /** 列出全部读卡器（真实硬件优先，mock 兜底；失败经 error 字段回传，永不 reject） */
  listReaders: invoke<() => Promise<{ ok: true, readers: IdReaderDevice[] } | { ok: false, error: { code: string, message: string } }>>(),
  /**
   * 读一张证卡（打开 → 认证 → 读取 → 关闭全程锁定）。
   * deviceId 缺省时平台自动选用第一个就绪的读卡器；
   * 永不 reject，失败经返回值 error 字段回传（错误码见 IdReaderErrorCode）。
   */
  readIdCard: invoke<(req?: { deviceId?: string }) => IdReaderResult>(),
}
