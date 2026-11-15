import type { DomainRouter } from '@shell/devices'
import type { Startable } from '@shell/kernel'
import type { Logger } from '@shell/kernel/logger'
import type { DomainCallContext, DomainIpcSender } from '@shell/shared'
import type { OverlayService } from '@shell/window'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'

/** 请求体上限：入参都是小 JSON，超限即断（回环 + token 之下仍不给无限读内存的口子） */
const MAX_BODY_BYTES = 64 * 1024

/** 域/路由错误码 → HTTP 状态：外部产品按 code 分支，状态码只做粗分类 */
const ERROR_STATUS: Record<string, number> = {
  DEVICE_BUSY: 409,
  DEVICE_NOT_FOUND: 404,
  DEVICE_OFFLINE: 409,
  PERMISSION_DENIED: 403,
  VALIDATION_FAILED: 400,
  INVALID_INPUT: 400,
  METHOD_NOT_FOUND: 404,
  DOMAIN_UNAVAILABLE: 409,
  CAPTURE_FAILED: 500,
  CHANNEL_UNAVAILABLE: 409,
  SAVE_FAILED: 500,
  UNKNOWN: 500,
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export interface HttpGatewayOptions {
  port: number
  /** token → appId 身份表（flavor 受信任部署输入）；appId 的权限须另行声明，未声明一律拒绝 */
  tokens: readonly { token: string, appId: string }[]
  /** 域调用唯一入口：能力矩阵 → 授权 → zod 校验 → handler 四道关与 IPC 调用面同源 */
  router: DomainRouter
  /** 浮层宿主：settings/config 表面开显 */
  overlays: OverlayService
  /** 调用方展示名解析（catalog 反查；缺省回落 appId） */
  appNameOf: (appId: string) => string | undefined
  logger: Logger
}

/** 连接断开 = 发起方销毁：拍摄会话按发起端销毁收场（浮层随之关闭），与 tab 销毁同语义 */
function senderOf(res: ServerResponse): DomainIpcSender {
  let destroyed = false
  let listener: (() => void) | undefined
  res.on('close', () => {
    destroyed = true
    listener?.()
  })
  return {
    isDestroyed: () => destroyed,
    once: (event, cb) => {
      if (event === 'destroyed') { listener = cb }
    },
  }
}

function errorCodeOf(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err && typeof err.code === 'string') { return err.code }
  return 'UNKNOWN'
}

/**
 * agent 服务面 HTTP 网关：只听回环，token → appId 即调用方身份，
 * 域调用复用 DomainRouter 四道关（授权/遥测与 IPC 面同源），浮层动作直达 OverlayService。
 * 拍摄为长请求：响应挂起至浮层收场（确认=结果数组，取消=空数组），连接断开即作废会话。
 */
export class HttpGateway implements Startable {
  readonly name = 'http-gateway'
  private readonly tokens = new Map<string, string>()
  private server?: Server

  constructor(private readonly options: HttpGatewayOptions) {
    for (const { token, appId } of options.tokens) { this.tokens.set(token, appId) }
  }

  async start(): Promise<void> {
    const server = createServer((req, res) => { this.dispatch(req, res) })
    this.server = server
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(this.options.port, '127.0.0.1', () => resolve())
    })
    this.options.logger.info('http gateway listening', { port: this.options.port })
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = undefined
    if (!server) { return }
    await new Promise<void>((resolve) => { server.close(() => resolve()) })
  }

  private dispatch(req: IncomingMessage, res: ServerResponse): void {
    // 外部产品页可能跑在自己壳的渲染层里，跨源 fetch 需要预审批；token 仍逐请求校验
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      res.writeHead(204)
      res.end()
      return
    }
    const path = (req.url ?? '/').split('?')[0] ?? '/'
    if (req.method === 'GET' && path === '/health') {
      this.send(res, 200, { service: 'shell-agent' })
      return
    }
    const appId = this.authenticAppId(req)
    if (!appId) {
      this.send(res, 401, { code: 'UNAUTHORIZED', message: '缺少或无效的访问令牌' })
      return
    }
    void this.route(appId, req, res, path)
  }

  private async route(appId: string, req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    try {
      if (req.method === 'POST' && path === '/capture/open') {
        const input = await this.readJson(req)
        const ctx: DomainCallContext = {
          appId,
          instanceId: 'http',
          appName: this.options.appNameOf(appId) ?? appId,
          sender: senderOf(res),
          log: message => this.options.logger.scope('http-gateway').info(message, { method: 'capture.openCaptureDialog', appId }),
        }
        const results = await this.options.router.call('capture.openCaptureDialog', input, ctx)
        this.send(res, 200, { results })
        return
      }
      if (req.method === 'POST' && path === '/settings/open') {
        this.options.overlays.open('settings')
        this.send(res, 200, { opened: true })
        return
      }
      if (req.method === 'POST' && path === '/config/open') {
        const body = await this.readJson(req)
        const kind = body && typeof body === 'object' && 'kind' in body && typeof body.kind === 'string' ? body.kind : 'devices'
        this.options.overlays.open('config', { kind })
        this.send(res, 200, { opened: true })
        return
      }
      this.send(res, 404, { code: 'NOT_FOUND', message: '未知的服务路径' })
    }
    catch (err) {
      if (err instanceof HttpError) {
        this.send(res, err.status, { code: err.code, message: err.message })
        return
      }
      const code = errorCodeOf(err)
      this.send(res, ERROR_STATUS[code] ?? 500, { code, message: err instanceof Error ? err.message : String(err) })
      this.options.logger.error('http gateway call failed', { path, appId, code, error: String(err) })
    }
  }

  private readJson(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let size = 0
      req.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_BODY_BYTES) {
          reject(new HttpError(413, 'PAYLOAD_TOO_LARGE', '请求体超出大小上限'))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8')
        if (!raw) {
          resolve({})
          return
        }
        const parsed: unknown = JSON.parse(raw)
        resolve(parsed)
      })
      req.on('error', reject)
    }).catch((err: unknown) => {
      // JSON.parse 抛 SyntaxError 归一为 400
      if (err instanceof SyntaxError) { throw new HttpError(400, 'INVALID_JSON', '请求体不是合法 JSON') }
      throw err
    })
  }

  private authenticAppId(req: IncomingMessage): string | undefined {
    const header = req.headers.authorization ?? ''
    const [scheme, token] = header.split(' ')
    if (scheme?.toLowerCase() !== 'bearer' || !token) { return undefined }
    return this.tokens.get(token)
  }

  private send(res: ServerResponse, status: number, body: unknown): void {
    if (res.writableEnded || res.destroyed) { return }
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body))
  }
}
