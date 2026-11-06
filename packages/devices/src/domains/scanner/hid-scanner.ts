import type { ScannerStatus, ScanResult } from '@shell/shared'
import type { WsLike } from '../kernel/channel/ws-channel'
import type { KeyboardScanner } from './keyboard-scanner'
import { connectWs, parseWsUrl, tcpProbe } from '../kernel/channel/ws-channel'

/**
 * 厂商本地服务 HID 扫码通道（CamSDKServer（华夏电通）BarcodeScanner，由服务端监听 HID 条码枪）。
 * 协议依据：CamSDK《接口通用标准规范.pdf》条码枪章节 + 官方 demo JS/otherDev/HidPos.js：
 *   BarcodeScanner {enable:1} 开启扫描（ACK 带 devSN）→ Notify {event:'OnReceivePosData', data} 推送条码；
 *   enable:0 关闭。ACK 失败（如 257 = 开启设备失败，枪未接）停止通道如实上报，不做无意义重连。
 * 过滤链（minLength/prefixes/requirePrefix）复用 KeyboardScanner.processComplete，与键盘仿真同规则。
 * 断线按固定间隔自动重连（覆盖本地服务每日定时重启场景）。
 */

/** CamSDKServer 扫码通道出厂地址（单一数据源；多厂商后再配置化） */
export const HID_SERVICE_URL = 'ws://127.0.0.1:9000'

const RECONNECT_DELAY_MS = 5000

export type HidStatusFn = (status: ScannerStatus) => void

export class HidScanner {
  private ws: WsLike | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  /** stop 后不再重连/收帧（生命周期总开关） */
  private stopped = false
  private devSN: string | undefined

  constructor(
    private readonly url: string,
    /** 条码过滤链（独立实例，与键盘仿真缓冲器互不污染） */
    private readonly filter: KeyboardScanner,
    private readonly onScan: (result: ScanResult) => void,
    private readonly onStatus: HidStatusFn,
  ) {}

  /** 启动通道：连接 → 开启扫描 */
  start(): void {
    this.stopped = false
    this.connect()
  }

  /** 停止通道：关闭扫描（best-effort）、断连、停重连 */
  stop(): void {
    this.stopped = true
    this.clearReconnect()
    const ws = this.ws
    this.ws = null
    if (ws) {
      try {
        ws.send(JSON.stringify({ func: 'BarcodeScanner', enable: 0, reqId: String(Date.now()) }))
      }
      catch {
        /* 连接已断时忽略 */
      }
      try {
        ws.close()
      }
      catch {
        /* 连接已断时忽略 */
      }
    }
    this.devSN = undefined
    this.onStatus({ mode: 'hid', connected: false, note: 'HID 通道已关闭' })
  }

  /** 诊断注入：走与推送完全相同的过滤链 */
  processComplete(code: string): void {
    this.filter.processComplete(code)
  }

  /** 服务探活（配置面板展示用；通道自身可用性以开启扫描 ACK 为准） */
  async probe(): Promise<boolean> {
    const { host, port } = parseWsUrl(this.url)
    return tcpProbe(host, port)
  }

  private connect(): void {
    if (this.stopped) {
      return
    }
    const ws = connectWs(this.url)
    this.ws = ws
    ws.onopen = () => {
      this.send({ func: 'BarcodeScanner', enable: 1, reqId: String(Date.now()) })
    }
    ws.onmessage = (ev) => {
      this.onMessage(ev)
    }
    ws.onerror = () => {
      /* 连接失败统一由 onclose 走重连与状态上报 */
    }
    ws.onclose = () => {
      this.ws = null
      this.devSN = undefined
      if (this.stopped) {
        return
      }
      this.onStatus({ mode: 'hid', connected: false, note: '本地服务连接断开，重连中' })
      this.clearReconnect()
      this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_DELAY_MS)
    }
  }

  private onMessage(ev: { data: unknown }): void {
    const msg = parseFrame(ev.data)
    if (!msg) {
      return
    }
    if (msg.func === 'BarcodeScanner') {
      this.onAck(msg)
      return
    }
    if (msg.func === 'Notify' && msg.event === 'OnReceivePosData' && typeof msg.data === 'string') {
      // 服务端 data 常带尾部回车换行（demo 原样展示含 \r\n），过滤链前先收边
      this.filter.processComplete(msg.data.trim())
    }
  }

  /** 开启扫描 ACK：成功记录 devSN 上报就绪；失败（枪未接/被占用）停止通道如实上报 */
  private onAck(msg: { result?: number, errorMsg?: string, devSN?: string }): void {
    if (msg.result === 0) {
      this.devSN = msg.devSN
      this.onStatus({ mode: 'hid', connected: true, devSN: this.devSN })
      return
    }
    this.stopped = true
    try {
      this.ws?.close()
    }
    catch {
      /* 连接已断时忽略 */
    }
    this.ws = null
    this.onStatus({ mode: 'hid', connected: false, note: `开启扫码通道失败：${String(msg.errorMsg ?? `错误码 ${String(msg.result)}`)}（确认条码枪已接入服务端）` })
  }

  private send(obj: Record<string, unknown>): void {
    try {
      this.ws?.send(JSON.stringify(obj))
    }
    catch {
      /* 连接已断：由 onclose 重连链路收口 */
    }
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}

interface HidFrame {
  func?: string
  event?: string
  data?: unknown
  result?: number
  errorMsg?: string
  devSN?: string
  [key: string]: unknown
}

/** 解析 CamSDK JSON 文本帧（二进制帧/非法 JSON 返回 null，调用方忽略） */
function parseFrame(data: unknown): HidFrame | null {
  if (typeof data !== 'string') {
    return null
  }
  try {
    return JSON.parse(data) as HidFrame
  }
  catch {
    return null
  }
}
