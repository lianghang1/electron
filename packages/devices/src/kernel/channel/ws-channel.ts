import { Buffer } from 'node:buffer'
import { createConnection } from 'node:net'
import { WebSocket } from 'ws'

/**
 * WebSocket 二进制类型
 */
export type WsBinaryType = 'nodebuffer' | 'arraybuffer' | 'fragments'

/**
 * WebSocket 兼容接口
 *
 * 屏蔽 ws 包的具体实现，统一厂商协议适配层的使用方式。
 */
export interface WsLike {
  binaryType: WsBinaryType
  send: (data: string | ArrayBuffer | Uint8Array) => void
  close: () => void
  terminate?: () => void
  onopen: (() => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  onerror: ((err: unknown) => void) | null
  onclose: (() => void) | null
}

/**
 * 创建 WebSocket 连接
 *
 * 常驻连接由调用方自行管理生命周期。
 */
export function connectWs(url: string): WsLike {
  const socket = new WebSocket(url)

  const bridge: WsLike = {
    binaryType: 'nodebuffer',

    send: data => socket.send(data),
    close: () => socket.close(),
    terminate: () => socket.terminate(),

    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
  }

  // 默认使用 Node Buffer 接收二进制帧
  socket.binaryType = bridge.binaryType

  socket.on('open', () => {
    bridge.onopen?.()
  })

  socket.on('message', (data) => {
    bridge.onmessage?.({ data })
  })

  socket.on('error', (err) => {
    bridge.onerror?.(err)
  })

  socket.on('close', () => {
    bridge.onclose?.()
  })

  // 同步底层 binaryType
  Object.defineProperty(bridge, 'binaryType', {
    enumerable: true,
    configurable: false,
    get: () => socket.binaryType,
    set: (value: WsBinaryType) => {
      socket.binaryType = value
    },
  })

  return bridge
}

/**
 * 帧负载转文本：文本帧直传，二进制帧按 utf8 解码（默认 nodebuffer 收帧）。
 * 部分厂商服务（如 CamSDKServer 的预览流/带图响应）以二进制帧包 JSON 推送，
 * 厂商协议解析前先经此归一，纯文本/二进制混合推送不再互斥。
 */
export function wsFrameText(data: unknown): string | null {
  if (typeof data === 'string') {
    return data
  }
  if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8')
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8')
  }
  return null
}

/**
 * TCP 探活
 *
 * 仅检测指定主机和端口是否可以建立 TCP 连接，
 * 不代表 WebSocket 协议或硬件设备已经正常。
 */
export function tcpProbe(
  host: string,
  port: number,
  timeoutMs = 1500,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false

    const socket = createConnection({ host, port })

    const done = (result: boolean): void => {
      if (settled) {
        return
      }

      settled = true
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(timeoutMs)

    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
    socket.once('close', () => done(false))
  })
}

/**
 * 解析 WebSocket 地址
 *
 * 支持：
 * ws://127.0.0.1:8080
 * ws://localhost:8080/path
 * wss://example.com
 * ws://[::1]:8080
 */
export function parseWsUrl(url: string): {
  host: string
  port: number
} {
  let parsed: URL

  try {
    parsed = new URL(url)
  }
  catch {
    throw new Error(`无法解析 WebSocket 地址: ${url}`)
  }

  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error(`不支持的 WebSocket 协议: ${parsed.protocol}`)
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '')
  const port = Number(
    parsed.port || (parsed.protocol === 'wss:' ? 443 : 80),
  )

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`无效的 WebSocket 地址: ${url}`)
  }

  return { host, port }
}

/**
 * 会话结束器
 *
 * 多次调用只生效一次。
 */
export type WsSettle<T> = (err?: unknown, value?: T) => void

/**
 * WebSocket 短会话配置
 */
export interface WsSessionHooks<T> {
  /** 整个会话的总超时时间 */
  timeoutMs: number

  /** 总超时错误 */
  onTimeout: () => Error

  /** 连接错误 */
  onConnectError: (url: string) => Error

  /** 连接提前关闭 */
  onClosedEarly: () => Error

  /**
   * 连接建立后的协议处理
   *
   * 用于发送初始化指令、注册状态监听等。
   */
  run: (
    ws: WsLike,
    settle: WsSettle<T>,
    onDispose: (fn: () => void) => void,
  ) => void

  /**
   * 消息处理
   *
   * 由厂商适配器自行实现协议解析和状态机。
   */
  onMessage: (
    ev: { data: unknown },
    ws: WsLike,
    settle: WsSettle<T>,
  ) => void
}

/**
 * 安全执行清理函数
 */
function disposeSafely(disposers: (() => void)[]): void {
  while (disposers.length) {
    const dispose = disposers.pop()!

    try {
      dispose()
    }
    catch {
      // 单个资源清理失败，不影响其他资源释放
    }
  }
}

/**
 * 短连接会话模板
 *
 * 生命周期：
 *
 * 创建连接
 *    ↓
 * 连接成功
 *    ↓
 * run（发送厂商指令）
 *    ↓
 * onMessage（解析协议）
 *    ↓
 * settle（成功 / 失败 / 超时）
 *    ↓
 * 清理资源并关闭连接
 */
export function withWsSession<T>(
  url: string,
  hooks: WsSessionHooks<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false

    let timer: ReturnType<typeof setTimeout> | undefined
    let closeTimer: ReturnType<typeof setTimeout> | undefined

    const disposers: (() => void)[] = []

    // 创建连接
    const ws = connectWs(url)

    /**
     * 注册附加清理任务
     *
     * 如果会话已经结束，则立即执行。
     */
    const onDispose = (fn: () => void): void => {
      if (settled) {
        try {
          fn()
        }
        catch {
          // 忽略清理异常
        }
        return
      }

      disposers.push(fn)
    }

    /**
     * 幂等结束会话
     */
    const settle: WsSettle<T> = (err, value) => {
      if (settled) {
        return
      }

      settled = true

      // 清除总超时
      if (timer !== undefined) {
        clearTimeout(timer)
      }

      // 清除连接兜底关闭定时器
      if (closeTimer !== undefined) {
        clearTimeout(closeTimer)
      }

      // 执行附加资源清理
      disposeSafely(disposers)

      // 关闭 WebSocket
      try {
        ws.close()

        // 防止对端不响应关闭握手，导致连接长期残留
        closeTimer = setTimeout(() => {
          try {
            ws.terminate?.()
          }
          catch {
            // 忽略连接强制关闭异常
          }
        }, 500)

        // 不让兜底关闭定时器阻止 Electron 主进程退出
        closeTimer.unref?.()
      }
      catch {
        // 忽略关闭异常
      }

      // 完成 Promise
      if (err !== undefined && err !== null) {
        reject(err)
      }
      else {
        resolve(value as T)
      }
    }

    /**
     * 统一错误工厂
     *
     * 防止错误工厂本身抛异常，导致会话无法结束。
     */
    const createError = (
      factory: () => Error,
      fallback: string,
    ): Error => {
      try {
        return factory()
      }
      catch {
        return new Error(fallback)
      }
    }

    // 总超时
    timer = setTimeout(() => {
      settle(
        createError(
          hooks.onTimeout,
          'WebSocket 会话超时',
        ),
      )
    }, hooks.timeoutMs)

    /**
     * 连接成功
     */
    ws.onopen = () => {
      if (settled) {
        return
      }

      try {
        hooks.run(ws, settle, onDispose)
      }
      catch (err) {
        settle(err)
      }
    }

    /**
     * 接收消息
     */
    ws.onmessage = (ev) => {
      if (settled) {
        return
      }

      try {
        hooks.onMessage(ev, ws, settle)
      }
      catch (err) {
        settle(err)
      }
    }

    /**
     * 连接错误
     */
    ws.onerror = () => {
      if (settled) {
        return
      }

      settle(
        createError(
          () => hooks.onConnectError(url),
          `WebSocket 连接异常: ${url}`,
        ),
      )
    }

    /**
     * 连接关闭
     */
    ws.onclose = () => {
      if (settled) {
        return
      }

      settle(
        createError(
          hooks.onClosedEarly,
          `WebSocket 连接提前关闭: ${url}`,
        ),
      )
    }
  })
}
