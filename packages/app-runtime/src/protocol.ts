import type { Session } from 'electron'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { protocol } from 'electron'

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

/**
 * 应用目录解析：root 是父目录，dir 是应用目录名。
 * 热更后指针可能把 appId 映射到 userData 下的版本化目录，协议必须跟随指针，
 * 与 dist-hot 的写入同源；内置应用走 resources/apps/<appId>。
 */
export interface AppRoot {
  root: string
  dir: string
}

export type AppRootResolver = (appId: string) => AppRoot

/** 注册协议处理器：resolve 由组合根注入，协议层不认识 userData 指针 */
export function registerAppProtocol(session: Session, resolve: AppRootResolver): void {
  session.protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url)
    // app://<appId>/<path...>
    const appId = url.hostname
    if (!appId || !/^[a-z][a-z0-9-]*$/.test(appId)) {
      return new Response('bad app id', { status: 403 })
    }

    const relative = decodeURIComponent(url.pathname).replace(/^\//, '')
    const { root, dir } = resolve(appId)
    const base = join(root, dir)
    const resolved = normalize(join(base, relative))
    // 路径穿越防护：归一化结果必须仍位于该应用目录内
    if (!resolved.startsWith(base + sep)) {
      return new Response('forbidden', { status: 403 })
    }

    const mime = MIME[extname(resolved).toLowerCase()]
    if (!mime || !existsSync(resolved) || !statSync(resolved).isFile()) {
      return new Response('not found', { status: 404 })
    }
    return new Response(readFileSync(resolved), {
      headers: { 'content-type': mime },
    })
  })
}
