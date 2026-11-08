import type { Logger } from '@shell/kernel/logger'
import type { HostRequest, HostResponse } from './protocol'
import { utilityProcess } from 'electron'
import { DeviceHostError, HostRemoteError } from './errors'

/** 崩溃后退避窗口：1s → 2s → 4s … 封顶 30s；请求成功后归位 */
const INITIAL_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30_000
/** 单请求超时：读卡认证（寻卡→选卡→认证→读取）正常数秒内完成，30s 覆盖慢速硬件 */
const REQUEST_TIMEOUT_MS = 30_000

interface PendingEntry {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
  timer: NodeJS.Timeout
}

/**
 * 设备守护进程管理器（崩溃防护第 2 层主进程侧）：
 * utilityProcess 承载全部厂商 DLL 的 koffi 调用，native 崩溃只炸守护进程。
 * - 懒启动：首个设备请求才拉起进程（不调设备零开销）
 * - 请求-响应：requestId 配对 + 30s 超时，设备错误按 HostRemoteError 原码抛回
 * - 自愈：进程退出后 pending 全拒（DEVICE_HOST_CRASHED），退避窗口内新请求快速失败，
 *   窗口过后下次请求自动重启；任一请求成功即退避归位
 */
export class DeviceHost {
  private proc?: Electron.UtilityProcess
  private readonly pending = new Map<number, PendingEntry>()
  private nextId = 1
  /** spawn 进行中的 promise（防并发 fork） */
  private booting?: Promise<void>
  /** 退避窗口截止时刻：崩溃后窗口内新请求快速失败，不空转重启 */
  private blockedUntil = 0
  private backoffMs = INITIAL_BACKOFF_MS
  private disposed = false

  constructor(
    private readonly logger: Logger,
    /** 守护进程入口 js：宿主构建产物（out/main/device-host.js），与主进程 bundle 同目录 */
    private readonly entryPath: string,
  ) {}

  /** 设备 RPC：懒启动 + 请求-响应；守护进程错误（驱动错误码原样）经 rejection 抛出 */
  request<T>(method: string, payload?: unknown): Promise<T> {
    if (this.disposed) {
      return Promise.reject(new DeviceHostError('DEVICE_HOST_UNAVAILABLE', '设备守护进程已释放'))
    }
    const remainingBackoff = this.blockedUntil - Date.now()
    if (remainingBackoff > 0) {
      return Promise.reject(new DeviceHostError(
        'DEVICE_HOST_CRASHED',
        '设备守护进程崩溃重启中，请稍后重试',
        { retryAfterMs: remainingBackoff },
      ))
    }
    return this.ensureProcess().then(() => this.send<T>(method, payload))
  }

  /** 预热：后台提前拉起守护进程（含 koffi 加载），把冷启动成本移出用户首次设备操作；失败静默（懒启动兜底） */
  warmup(): Promise<void> {
    if (this.disposed) {
      return Promise.resolve()
    }
    return this.ensureProcess().catch((err) => {
      this.logger.warn('device host warmup failed', { err })
    })
  }

  /** 释放：pending 全拒 + 杀进程（runtime 退出时调用） */
  dispose(): void {
    this.disposed = true
    this.rejectAllPending(new DeviceHostError('DEVICE_HOST_UNAVAILABLE', '设备守护进程已释放'))
    this.proc?.kill()
    this.proc = undefined
  }

  private ensureProcess(): Promise<void> {
    if (this.proc) {
      return Promise.resolve()
    }
    if (this.booting) {
      return this.booting
    }
    this.booting = this.spawn().finally(() => {
      this.booting = undefined
    })
    return this.booting
  }

  private spawn(): Promise<void> {
    return new Promise<void>((resolve) => {
      const proc = utilityProcess.fork(this.entryPath, [], { serviceName: 'device-host' })
      proc.on('message', (response: HostResponse) => this.onResponse(response))
      proc.on('exit', (exitCode: number) => this.onExit(proc, exitCode))
      this.proc = proc
      this.logger.info('device host spawned', { entry: this.entryPath })
      // fork 同步返回即消息通道就绪；入口模块加载失败经 exit 走崩溃语义（pending 由 exit 清理拒绝）
      resolve()
    })
  }

  private send<T>(method: string, payload: unknown): Promise<T> {
    const proc = this.proc
    if (!proc) {
      return Promise.reject(new DeviceHostError('DEVICE_HOST_UNAVAILABLE', '设备守护进程未就绪'))
    }
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new DeviceHostError('DEVICE_HOST_TIMEOUT', `设备请求超时（${REQUEST_TIMEOUT_MS / 1000}s）: ${method}`))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
      const request: HostRequest = { id, method, payload }
      proc.postMessage(request)
    })
  }

  private onResponse(response: HostResponse): void {
    const entry = this.pending.get(response.id)
    if (!entry) {
      return
    }
    this.pending.delete(response.id)
    clearTimeout(entry.timer)
    // 请求成功往返即进程可用：退避归位（快速失败窗口立即解除）
    this.backoffMs = INITIAL_BACKOFF_MS
    if (response.error) {
      entry.reject(new HostRemoteError(response.error))
    }
    else {
      entry.resolve(response.result)
    }
  }

  private onExit(proc: Electron.UtilityProcess, exitCode: number): void {
    if (this.proc !== proc) {
      return
    }
    this.proc = undefined
    this.rejectAllPending(new DeviceHostError('DEVICE_HOST_CRASHED', `设备守护进程已退出（exitCode: ${exitCode}），设备请求未完成`))
    if (this.disposed) {
      return
    }
    this.blockedUntil = Date.now() + this.backoffMs
    this.logger.error('device host exited, enter backoff', { exitCode, backoffMs: this.backoffMs })
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS)
  }

  private rejectAllPending(error: DeviceHostError): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
    this.pending.clear()
  }
}
