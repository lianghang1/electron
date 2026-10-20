/**
 * WS 通道基座：厂商本地 WebSocket 服务的连接与短会话模板。
 *
 * 各厂商协议（二进制帧/JSON 帧、状态机时序）差异大且多为"一次连接走完一个操作"形态，
 * 基座收口共性部分：连接创建、tcp 探活、URL 解析、幂等收尾（去重 settle、总超时、
 * 附加清理、连接兜底关闭）、连接失败/提前断开的统一错误注入。
 */
import { WebSocket } from 'ws'

/** ws 包的浏览器兼容事件视图（文本帧 data 为 string、二进制帧为 ArrayBuffer） */
export interface WsLike {
  binaryType?: string
  send: (data: string | ArrayBuffer) => void
  close: () => void
  onopen: (() => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  onerror: ((err: unknown) => void) | null
  onclose: (() => void) | null
}

/** 创建 ws 连接（常驻会话由调用方自行管理生命周期） */
export function connectWs(url: string): WsLike {
  return new WebSocket(url) as unknown as WsLike
}

/** tcp 探活：端口可连即视为服务在线（不校验协议） */
export function tcpProbe(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const done = (v: boolean): void => {
      if (!settled) {
        settled = true
        resolve(v)
      }
    }
    import('node:net')
      .then((net) => {
        const socket = net.createConnection({ host, port }, () => {
          socket.destroy()
          done(true)
        })
        socket.setTimeout(timeoutMs)
        socket.on('timeout', () => {
          socket.destroy()
          done(false)
        })
        socket.on('error', () => done(false))
        socket.on('close', () => done(false))
      })
      .catch(() => done(false))
  })
}

/** 解析 ws://host:port 形式地址（探活用；路径段忽略） */
export function parseWsUrl(url: string): { host: string, port: number } {
  const m = /^ws:\/\/([^:/]+):(\d+)/.exec(url)
  if (!m) {
    throw new Error(`无法解析 WebSocket 地址: ${url}`)
  }
  return { host: m[1], port: Number(m[2]) }
}

/** 会话结束器：幂等（多次调用只生效首次），成功带值 resolve、失败带错 reject */
export type WsSettle<T> = (err?: unknown, value?: T) => void

export interface WsSessionHooks<T> {
  /** 全会话总超时（本地服务 + 硬件操作，按厂商协议取宽裕值） */
  timeoutMs: number
  onTimeout: () => Error
  onConnectError: (url: string) => Error
  onClosedEarly: () => Error
  /**
   * 连接建立后的协议逻辑：发送指令、注册附加清理（onDispose，settle 时必达执行，
   * 用于会话中途创建的延时器等资源）；通过 settle 结束会话。
   */
  run: (ws: WsLike, settle: WsSettle<T>, onDispose: (fn: () => void) => void) => void
  /** 帧/消息处理（文本帧 data 为 string、二进制帧为 ArrayBuffer；ws 可用于回发后续指令） */
  onMessage: (ev: { data: unknown }, ws: WsLike, settle: WsSettle<T>) => void
}

/**
 * 短连接会话模板：连接 → run（发指令）→ onMessage（驱动状态机）→ settle 收尾。
 * 错误注入点（超时/连接失败/提前断开）由调用方以工厂提供，保持各厂商错误码与文案。
 */
export function withWsSession<T>(url: string, hooks: WsSessionHooks<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const disposers: (() => void)[] = []
    const ws = connectWs(url)

    const settle: WsSettle<T> = (err, value) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      for (const dispose of disposers) {
        dispose()
      }
      try {
        ws.close()
      }
      catch {
        /* 连接已断时忽略 */
      }
      if (err) {
        reject(err)
      }
      else {
        resolve(value!)
      }
    }

    timer = setTimeout(() => settle(hooks.onTimeout()), hooks.timeoutMs)
    ws.onopen = () => hooks.run(ws, settle, fn => disposers.push(fn))
    ws.onmessage = ev => hooks.onMessage(ev, ws, settle)
    ws.onerror = () => settle(hooks.onConnectError(url))
    ws.onclose = () => settle(hooks.onClosedEarly())
  })
}
