import type { Logger } from '../../logger/logger'
import type { HostRequest, HostResponse } from './protocol'
import process from 'node:process'
import { utilityProcess } from 'electron'
import { DeviceHostError, HostRemoteError } from './errors'
import { DEVICE_HOST_CRASH_ENV } from './run'

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
  /** 崩溃注入只做一次：重启后的实例恢复常驻服务（验证自愈闭环，正式部署该环境变量不存在） */
  private crashInjected = false
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
      // 崩溃注入：首次 spawn 且环境变量开启时传给子进程（重启后的实例不再注入，可观察自愈）
      const injectCrash = !this.crashInjected && process.env[DEVICE_HOST_CRASH_ENV] === '1'
      if (injectCrash) {
        this.crashInjected = true
      }
      const forkOptions: Parameters<typeof utilityProcess.fork>[2] = {}
      // 联调注入开关曾出现在环境里时显式覆盖子进程值（重启后的实例不再继承 '1'，避免崩溃死循环）
      if (process.env[DEVICE_HOST_CRASH_ENV] !== undefined) {
        forkOptions.env = { ...process.env, [DEVICE_HOST_CRASH_ENV]: injectCrash ? '1' : '' }
      }
      const proc = utilityProcess.fork(this.entryPath, [], { serviceName: 'device-host', ...forkOptions })
      proc.on('message', (response: HostResponse) => this.onResponse(response))
      proc.on('exit', (exitCode: number) => this.onExit(proc, exitCode))
      this.proc = proc
      this.logger.info('device host spawned', { entry: this.entryPath, injectCrash })
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
