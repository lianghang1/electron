/**
 * HTTP 通道基座
 *
 * 用于厂商本地 HTTP 服务的探活与请求。
 *
 * 职责：
 * 1. HTTP 服务可用性探测
 * 2. 请求超时控制
 * 3. AbortController 请求取消
 *
 * 设计原则：
 * - 不自动重试
 * - 不处理厂商业务协议
 * - 不解析业务响应
 * - 不改变调用方原有的请求语义
 */

/**
 * HTTP 服务探活
 *
 * 只要能够收到 HTTP 响应，即视为服务在线。
 * 不校验 HTTP 状态码，例如 200、404、500 均视为可达。
 *
 * @param baseUrl 服务地址
 * @param timeoutMs 超时时间，默认 2000ms
 */
export async function probeHttp(
  baseUrl: string,
  timeoutMs = 2000,
): Promise<boolean> {
  const controller = new AbortController()

  const timer = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    await fetch(baseUrl, {
      method: 'GET',
      signal: controller.signal,
    })

    return true
  }
  catch {
    return false
  }
  finally {
    clearTimeout(timer)
  }
}

/**
 * HTTP 请求
 *
 * 支持：
 * - 普通请求
 * - 超时自动取消
 * - 调用方主动取消
 *
 * 不自动重试。
 *
 * @param url 请求地址
 * @param init Fetch 请求配置
 * @param timeoutMs 超时时间，不传则不设置超时
 */
export async function httpRequest(
  url: string,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<Response> {
  // 不设置超时，保持原生 fetch 行为
  if (timeoutMs === undefined) {
    return fetch(url, init)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  // 监听调用方主动取消
  const externalSignal = init.signal

  const abortHandler = (): void => {
    controller.abort()
  }

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    }
    else {
      externalSignal.addEventListener('abort', abortHandler, {
        once: true,
      })
    }
  }

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  }
  finally {
    clearTimeout(timer)

    externalSignal?.removeEventListener('abort', abortHandler)
  }
}
