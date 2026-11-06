/**
 * HTTP 通道基座：厂商本地 HTTP 服务的探活与请求模板。
 * 收口 AbortController 超时模板与"连上即活"的探活语义；请求失败不重试（厂商服务在本机，重试无意义）。
 */

/** 服务探活：GET baseUrl，只要 TCP+HTTP 可达（哪怕 404）即视为服务活着 */
export async function probeHttp(baseUrl: string, timeoutMs = 2000): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    await fetch(baseUrl, { signal: ctrl.signal })
    clearTimeout(t)
    return true
  }
  catch {
    return false
  }
}

/** 带超时的 HTTP 请求（timeoutMs 缺省不设超时，保持调用方原语义） */
export async function httpRequest(url: string, init: RequestInit, timeoutMs?: number): Promise<Response> {
  if (timeoutMs === undefined) {
    return fetch(url, init)
  }
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  }
  finally {
    clearTimeout(t)
  }
}
