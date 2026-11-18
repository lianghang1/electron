import type { HostRequest, HostResponse } from '../../../host/protocol'
import type { RasterizeConfig } from './contract'
import { utilityProcess } from 'electron'
import { printError } from '../errors'

/**
 * 栅格化守护进程管理器（主进程侧）：按需启动 + 空闲回收，与 device-host 并列。
 * - 懒启动：首个栅格化请求才拉起进程（不用栅格化零开销）
 * - 并发 1 队列：大文档渲染内存可达数百 MB，串行防内存挤爆（对齐 conflux 单队列）
 * - 空闲回收：60s 无请求即退出进程，wasm (~3MB) 与渲染内存不常驻
 * - 崩溃退避：wasm 崩溃多为特定文档触发，快速重试无意义——5s 窗口内新请求快速失败
 */

/** 栅格化进程生命周期日志（kernel Logger 的结构子集，无 Logger 装配现场可传静默实现） */
interface RasterizeLogger {
  info: (message: string, metadata?: Record<string, unknown>) => void
  error: (message: string, metadata?: Record<string, unknown>) => void
}

/** 单请求超时：大图纸页（CAD 导出）高 DPI 渲染可达分钟级，30s 不够 */
const REQUEST_TIMEOUT_MS = 120_000
/** 空闲回收：无请求 60s 后退出 */
const IDLE_EXIT_MS = 60_000
/** 崩溃退避窗口 */
const CRASH_BACKOFF_MS = 5000

interface PendingEntry {
  resolve: (value: Uint8Array) => void
  reject: (error: unknown) => void
  timer: NodeJS.Timeout
}

export class RasterizeWorker {
  private proc?: Electron.UtilityProcess
  private readonly pending = new Map<number, PendingEntry>()
  private nextId = 1
  /** spawn 进行中的 promise（防并发 fork） */
  private booting?: Promise<Electron.UtilityProcess>
  private blockedUntil = 0
  private idleTimer?: NodeJS.Timeout
  /** 空闲自杀标记：exit 时不走崩溃退避 */
  private idleStopping = false
  private disposed = false
  /** 并发 1 队列尾：串行链，单次失败不断链 */
  private tail: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly logger: RasterizeLogger,
    /** worker 入口 js：宿主构建产物（out/main/rasterize-worker.js），与主进程 bundle 同目录 */
    private readonly entryPath: string,
  ) {}

  /** PDF → 栅格化 repaper PDF：入参 config 已由 assertRasterizeConfig 校验 */
  toPdf(bytes: Uint8Array, config: RasterizeConfig): Promise<Uint8Array> {
    const run = this.tail.then(() => this.send({ bytes, config }))
    this.tail = run.catch(() => undefined)
    return run
  }

  /** 释放：pending 全拒 + 杀进程（runtime 退出时调用） */
  dispose(): void {
    this.disposed = true
    this.clearIdleTimer()
    this.rejectAllPending(printError('CHANNEL_UNAVAILABLE', '栅格化进程已释放'))
    this.proc?.kill()
    this.proc = undefined
  }

  private async send(payload: { bytes: Uint8Array, config: RasterizeConfig }): Promise<Uint8Array> {
    if (this.disposed) {
      throw printError('CHANNEL_UNAVAILABLE', '栅格化进程已释放')
    }
    const remainingBackoff = this.blockedUntil - Date.now()
    if (remainingBackoff > 0) {
      throw printError('RENDER_FAILED', `栅格化进程崩溃重启中，请稍后重试（${Math.ceil(remainingBackoff / 1000)}s 内）`)
    }
    const proc = await this.ensureProcess()
    const id = this.nextId++
    return new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(printError('RENDER_FAILED', `PDF 栅格化超时（${REQUEST_TIMEOUT_MS / 1000}s）：可降低 DPI 或拆分源文件后重试`))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timer })
      const request: HostRequest = { id, method: 'rasterize.toPdf', payload }
      proc.postMessage(request)
    })
  }

  private ensureProcess(): Promise<Electron.UtilityProcess> {
    if (this.proc) {
      return Promise.resolve(this.proc)
    }
    if (this.booting) {
      return this.booting
    }
    this.booting = this.spawn().finally(() => {
      this.booting = undefined
    })
    return this.booting
  }

  private spawn(): Promise<Electron.UtilityProcess> {
    return new Promise<Electron.UtilityProcess>((resolve) => {
      const proc = utilityProcess.fork(this.entryPath, [], { serviceName: 'rasterize-worker' })
      proc.on('message', (response: HostResponse) => this.onResponse(response))
      proc.on('exit', (exitCode: number) => this.onExit(proc, exitCode))
      this.proc = proc
      this.logger.info('rasterize worker spawned', { entry: this.entryPath })
      // fork 同步返回即消息通道就绪；入口模块加载失败经 exit 走崩溃语义（pending 由 exit 清理拒绝）
      resolve(proc)
    })
  }

  private onResponse(response: HostResponse): void {
    const entry = this.pending.get(response.id)
    if (!entry) {
      return
    }
    this.pending.delete(response.id)
    clearTimeout(entry.timer)
    if (response.error) {
      entry.reject(printError(
        (response.error.code as 'RENDER_FAILED' | 'VALIDATION_FAILED' | 'CHANNEL_UNAVAILABLE' | 'UNKNOWN') ?? 'UNKNOWN',
        response.error.message,
        response.error.detail,
      ))
    }
    else {
      entry.resolve((response.result as { pdf: Uint8Array }).pdf)
    }
    // 响应往返即进程健康：请求完成后重新武装空闲回收
    this.armIdleExit()
  }

  private armIdleExit(): void {
    this.clearIdleTimer()
    this.idleTimer = setTimeout(() => {
      if (!this.proc || this.disposed) {
        return
      }
      this.idleStopping = true
      this.logger.info('rasterize worker idle exit')
      this.proc.kill()
      this.proc = undefined
    }, IDLE_EXIT_MS)
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = undefined
    }
  }

  private onExit(proc: Electron.UtilityProcess, exitCode: number): void {
    if (this.proc !== proc) {
      return
    }
    this.proc = undefined
    if (this.disposed) {
      return
    }
    if (this.idleStopping) {
      this.idleStopping = false
      return
    }
    this.rejectAllPending(printError('RENDER_FAILED', `栅格化进程已退出（exitCode: ${exitCode}），栅格化未完成`))
    this.blockedUntil = Date.now() + CRASH_BACKOFF_MS
    this.logger.error('rasterize worker exited, enter backoff', { exitCode, backoffMs: CRASH_BACKOFF_MS })
  }

  private rejectAllPending(error: unknown): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
    this.pending.clear()
  }
}
