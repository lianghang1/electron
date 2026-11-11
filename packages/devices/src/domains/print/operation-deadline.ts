import type { PrintErrorCode } from '@shell/shared'
import { withDeadline } from '../../runtime/deadline'
import { printError } from './errors'

/**
 * 打印操作的超时适配：超时机制由 runtime/deadline 提供唯一实现，
 * 本层只负责把超时翻译为打印域的错误码（对外契约），不重复实现计时逻辑。
 */
export function withPrintDeadline<T>(
  task: Promise<T>,
  timeoutMs: number,
  code: PrintErrorCode,
  message: string,
): Promise<T> {
  return withDeadline(task, timeoutMs, ms => printError(code, message, { timeoutMs: ms }))
}
