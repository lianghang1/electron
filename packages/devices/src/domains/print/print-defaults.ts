import type { PrintRequest } from '@shell/shared'

/** 配置中心缺省参数与请求显式参数合并：显式值优先，缺省字段由现场配置补齐。 */
export function mergePrintDefaults(
  request: PrintRequest,
  defaults?: Record<string, unknown>,
): PrintRequest {
  if (!defaults || Object.keys(defaults).length === 0) { return request }
  return { ...request, options: { ...defaults, ...request.options } as PrintRequest['options'] }
}
