import type { WsLike } from '../../../kernel/channel/ws-channel'
import { connectWs, parseWsUrl, tcpProbe } from '../../../kernel/channel/ws-channel'
import { signatureError } from '../errors'

/**
 * CamSDK 签名屏厂商模块（ws 路线，to:2 由 CamSDKServer 转发给扩展屏程序 PadViewer4）。
 * CamSDK = 华夏电通「华夏扫描中间件」（本地服务 CamSDKServer，ws://127.0.0.1:9000）。
 * 协议依据：CamSDK《接口通用标准规范.pdf》扩展屏接口章 + 官方 demo JS/otherDev/Sign.js。
 *
 * 签字&指纹一体流程（startSignAndGetFingerprint，PadViewer 内置签字页）：
 *   navigate('')（url 空 = 拉起 PadViewer4 并显示广告页）→ startSignAndGetFingerprint
 *   → PadViewer 分两次回推：pvSignature（签名图）→ ReadFingerInfo（指纹图，流程终点）
 *   → navigate('') 关闭签字页回到广告页。
 * 取消：openSign {sign:'close'} + navigate('') 收尾（best-effort）。
 * 推送帧无 reqId 配对关系，靠 func 区分；from:2 表示 PadViewer4 回传。
 * 能力约束：本机无签名屏时 PadViewer4 无法拉起，navigate 无 ACK——以报错如实呈现，不伪装。
 */

/** CamSDK 签名屏出厂配置（单一数据源；签名框 UI 由 PadViewer 内置签字页承担，无需 pos/color） */
export const CAMSDK_WS_PAD = {
  url: 'ws://127.0.0.1:9000',
  id: 'ws:camsdk',
  brand: 'CamSDK',
  displayName: 'CamSDK 签名屏（本地服务 9000）',
} as const

/** PadViewer 下发帧（签名域消费的公共字段） */
interface PadFrame {
  func?: string
  result?: number
  errorMsg?: string
  /** pvSignature：签名图 base64 */
  imgBase64?: string
  /** ReadFingerInfo：指纹图像 base64 */
  fingerImageBase64?: string
  mime?: string
  [key: string]: unknown
}

/** 签名会话设备侧产物（dataURL 形态交付渲染层） */
export interface PadSignResult {
  signImageDataUrl?: string
  fingerImageDataUrl?: string
}

function parseFrame(data: unknown): PadFrame | null {
  if (typeof data !== 'string') {
    return null
  }
  try {
    return JSON.parse(data) as PadFrame
  }
  catch {
    return null
  }
}

/** base64 + mime → dataURL（image/jpg 规范化为 image/jpeg，渲染层兼容性更好） */
function toDataUrl(base64: string, mime: string): string {
  return `data:${mime === 'image/jpg' ? 'image/jpeg' : mime};base64,${base64}`
}

type PadSettle = (err?: unknown, value?: PadSignResult) => void

type PadState = 'connecting' | 'active' | 'complete' | 'closed'

/**
 * PadViewer4 签名会话（常驻 ws 连接）：
 * open 拉起签字页后无总超时（书写时长不定），推送到达推进状态机；waitForResult 收口交付。
 */
export class CamSdkPadSession {
  private ws: WsLike | null = null
  private state: PadState = 'connecting'
  /** open 阶段 ACK 超时定时器（active 后清除——书写阶段无时限） */
  private ackTimer: ReturnType<typeof setTimeout> | null = null
  private signImg: string | undefined
  private fingerImg: string | undefined
  /** 推送失败/连接中断等会话级错误（waitForResult 时上抛） */
  private sessionError: unknown = null
  /** 指纹帧已到（startSignAndGetFingerprint 流程终点标志） */
  private fingerArrived = false
  private waiters: PadSettle[] = []

  /** 连接指定服务地址并拉起签字页（navigate('') 等 PadViewer4 ACK → startSignAndGetFingerprint；缺省出厂地址，档案制下由适配器按档案传入） */
  open(url: string = CAMSDK_WS_PAD.url): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = connectWs(url)
      this.ws = ws
      ws.onopen = () => {
        this.send({ func: 'navigate', url: '', to: 2, reqId: String(Date.now()) })
        this.ackTimer = setTimeout(() => {
          this.sessionError = signatureError('DEVICE_OFFLINE', '签名屏程序（PadViewer4）未响应（确认扩展屏已连接且 PadViewer4 可用）')
          this.close()
          reject(this.sessionError)
        }, 8000)
      }
      ws.onmessage = (ev) => {
        this.onMessage(ev, resolve)
      }
      ws.onerror = () => {
        this.sessionError ??= signatureError('DEVICE_OFFLINE', `CamSDKServer 连接失败: ${CAMSDK_WS_PAD.url}（确认已安装 CamSDK 且服务运行中）`)
      }
      ws.onclose = () => {
        clearTimeout(this.ackTimer ?? undefined)
        this.ackTimer = null
        // 拉起阶段断连（服务未启动等）立即上抛，不等 ACK 超时
        if (this.state === 'connecting') {
          this.sessionError ??= signatureError('DEVICE_OFFLINE', '签名屏连接在拉起阶段关闭')
          this.state = 'closed'
          this.ws = null
          reject(this.sessionError)
          return
        }
        if (this.state !== 'complete') {
          this.sessionError ??= signatureError('DEVICE_OFFLINE', '连接在签名完成前关闭')
          // active 阶段断连让等待者立即失败
          if (this.state === 'active') {
            this.flushWaiters()
          }
        }
        this.state = this.state === 'complete' ? 'complete' : 'closed'
      }
    })
  }

  /** 等待签名结果（推送齐活或出错）。已 complete 立即返回 */
  waitForResult(timeoutMs = 15000): Promise<PadSignResult> {
    return new Promise<PadSignResult>((resolve, reject) => {
      if (this.state === 'complete') {
        this.settleResult(resolve, reject)
        return
      }
      const timer = setTimeout(() => {
        reject(signatureError('DEVICE_OFFLINE', '签名屏未在限时内回传签名结果（请在签名屏上完成提交）'))
      }, timeoutMs)
      this.waiters.push((err, value) => {
        clearTimeout(timer)
        if (err) {
          reject(err)
          return
        }
        this.settleResult(resolve, reject)
      })
    })
  }

  /** 取消会话：关内置签字页回广告页（best-effort），随后断连 */
  cancel(): void {
    if (this.state === 'active') {
      this.send({ func: 'openSign', sign: 'close', to: 2, reqId: String(Date.now()) })
      this.send({ func: 'navigate', url: '', to: 2, reqId: String(Date.now()) })
    }
    this.close()
  }

  /** 幂等关闭：断连并释放等待者（complete 状态的等待者照常交付结果） */
  close(): void {
    const wasComplete = this.state === 'complete'
    this.state = wasComplete ? 'complete' : 'closed'
    clearTimeout(this.ackTimer ?? undefined)
    this.ackTimer = null
    try {
      this.ws?.close()
    }
    catch {
      /* 连接已断时忽略 */
    }
    this.ws = null
    if (!wasComplete) {
      this.flushWaiters()
    }
  }

  private onMessage(ev: { data: unknown }, onActive: () => void): void {
    const msg = parseFrame(ev.data)
    if (!msg) {
      return
    }
    if (msg.func === 'navigate') {
      // 拉起 ACK：PadViewer4 就绪 → 下发签字&指纹指令，会话进入书写阶段（无时限）
      clearTimeout(this.ackTimer ?? undefined)
      this.ackTimer = null
      if (msg.result !== 0) {
        this.sessionError = signatureError('DEVICE_OFFLINE', `签名屏拉起失败：${String(msg.errorMsg ?? `错误码 ${String(msg.result)}`)}`)
        this.close()
        return
      }
      this.send({ func: 'startSignAndGetFingerprint', to: 2, reqId: String(Date.now()) })
      this.state = 'active'
      onActive()
      return
    }
    if (msg.func === 'pvSignature' && msg.result === 0 && msg.imgBase64) {
      this.signImg = toDataUrl(msg.imgBase64, msg.mime ?? 'image/jpg')
      return
    }
    if (msg.func === 'ReadFingerInfo') {
      if (msg.result === 0 && msg.fingerImageBase64) {
        this.fingerImg = toDataUrl(msg.fingerImageBase64, msg.mime ?? 'image/bmp')
      }
      // 指纹帧 = 流程终点：关签字页回广告页，会话完成
      this.fingerArrived = true
      this.send({ func: 'navigate', url: '', to: 2, reqId: String(Date.now()) })
      this.state = 'complete'
      try {
        this.ws?.close()
      }
      catch {
        /* 连接已断时忽略 */
      }
      this.ws = null
      this.flushWaiters()
    }
  }

  /** 交付会话产物：出错优先上抛，未收到签名图视为流程未完成 */
  private settleResult(resolve: (v: PadSignResult) => void, reject: (e: unknown) => void): void {
    if (this.sessionError) {
      reject(this.sessionError)
      return
    }
    if (!this.signImg || !this.fingerArrived) {
      reject(signatureError('DEVICE_OFFLINE', '签名屏未回传完整签名数据（会话已中断）'))
      return
    }
    resolve({ signImageDataUrl: this.signImg, fingerImageDataUrl: this.fingerImg })
  }

  /** 唤醒全部等待者（错误路径：会话中断/取消） */
  private flushWaiters(): void {
    const err = this.sessionError ?? signatureError('SESSION_NOT_ACTIVE', '签名会话已结束')
    const waiters = this.waiters
    this.waiters = []
    for (const w of waiters) {
      w(err)
    }
  }

  private send(obj: Record<string, unknown>): void {
    try {
      this.ws?.send(JSON.stringify(obj))
    }
    catch {
      /* 连接已断：状态机由 onclose 收口 */
    }
  }
}

/** 服务探活（PadViewer4 是否可用以 start 阶段 ACK 为准，探活只到服务层） */
export async function probeCamSdkPad(url: string): Promise<boolean> {
  const { host, port } = parseWsUrl(url)
  return tcpProbe(host, port)
}
