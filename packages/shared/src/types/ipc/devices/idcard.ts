import type { IdcardConfig, IdCardData, IdcardDeviceOverrides, IdReaderDevice } from '../../devices/idcard'
import { invoke } from '../../../domain'

/**
 * idcard 域 · 身份证阅读器。
 * 与 print / capture / iccard 平级的独立原子域（按设备类型一文件，各自一个 DesktopApi 分组）。
 * 不与 capture 合并的理由：产出物不同（结构化 PII 数据 vs 图片文件），
 * 合规约束不同（PII 禁日志、即用即弃、脱敏）。
 *
 * 异常契约：失败 reject（IpcRemoteError，code 见 IdReaderErrorCode），
 * 渲染层 try/catch 按错误码分支。
 */
export const idcardDomainDefs = {
  /** 列出身份证阅读器（仅具备身份证能力的读卡器） */
  listReaders: invoke<() => Promise<IdReaderDevice[]>>(),
  /**
   * 读一张身份证（打开 → 认证 → 读取 → 关闭全程锁定）。
   * deviceId 缺省时平台自动选用第一个就绪的阅读器。
   */
  readIdCard: invoke<(req?: { deviceId?: string }) => Promise<IdCardData>>(),
  /** 读取域配置（ws/dll 双路线设备档案全量，只读视图） */
  getConfig: invoke<() => IdcardConfig>(),
  /** 按档案 id 提交白名单覆盖（名称/ws 地址；非法入参抛 VALIDATION_FAILED），返回保存后全量列表 */
  setConfig: invoke<(id: string, overrides: IdcardDeviceOverrides) => IdcardConfig>(),
}
