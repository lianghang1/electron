import type { PrintErrorCode } from '@desktop/shared'
import { printError } from './errors'

/**
 * 操作超时统一包装：任何可能挂起的底层操作（打印提交 / PDF 导出 / 外部命令）都必须包一层。
 * 超时后调用方立即得到统一错误码；底层操作尽力终止（进程 kill / 连接关闭）。
 */
export function withTimeout<T>(
  p: Promise<T>,
  timeoutMs: number,
  code: PrintErrorCode,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(printError(code, message, { timeoutMs })), timeoutMs)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}
