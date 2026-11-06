import type { Session } from 'electron'
import { protocol } from 'electron'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'

/**
 * app:// 内部页协议：服务打包好的应用 dist（resources/apps/<appId>/）。
 * 安全模型：
 * - scheme 注册为 standard + secure（组合根在 app ready 前调用 registerAppScheme）
 * - MIME 白名单响应（白名单外的扩展名一律 403）
 * - 归一化后强制限制在应用根目录内（防路径穿越）
 */
export const APP_SCHEME = 'app'

/** ready 前调用一次（registerSchemesAsPrivileged 的时序硬约束） */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ])
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
}

/** 注册协议处理器：appsRoot = 应用 dist 的根目录 */
export function registerAppProtocol(session: Session, appsRoot: string): void {
  session.protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url)
    // app://<appId>/<path...>
    const appId = url.hostname
    if (!appId || !/^[a-z][a-z0-9-]*$/.test(appId)) {
      return new Response('bad app id', { status: 403 })
    }

    const relative = decodeURIComponent(url.pathname).replace(/^\//, '')
    const resolved = normalize(join(appsRoot, appId, relative))
    // 路径穿越防护：归一化结果必须仍位于该应用目录内
    if (!resolved.startsWith(join(appsRoot, appId) + sep)) {
      return new Response('forbidden', { status: 403 })
    }

    const mime = MIME[extname(resolved).toLowerCase()]
    if (!mime || !existsSync(resolved) || !statSync(resolved).isFile()) {
      return new Response('not found', { status: 404 })
    }
    return new Response(createReadStream(resolved) as unknown as ReadableStream, {
      headers: { 'content-type': mime },
    })
  })
}
