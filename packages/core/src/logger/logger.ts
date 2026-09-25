import type { LogFunctions } from 'electron-log'
import log from 'electron-log/main'

export type LogFields = Record<string, string | number | boolean | undefined>

export interface LoggerOptions {
  /** debug 日志开关（默认关闭，避免影响用户），dev 模式由 Application 打开 */
  debug?: boolean
  /** 根作用域名，缺省 'desktop'；Application 按启动的 App 传入（appId 末段） */
  scope?: string
}

/**
 * 平台日志：基于 electron-log（console + 文件轮转 + 崩溃捕获），自身不能成为故障点。
 * - scope(name)：模块作用域，路径式叠加（desktop → desktop:tab）
 * - child(fields)：固定身份字段（appId / instanceId / tabId ...）随每条日志输出
 */
export class Logger {
  private readonly elog: LogFunctions

  constructor(
    private readonly scopePath: string = 'desktop',
    private readonly options: LoggerOptions = {},
    private readonly fields: LogFields = {},
  ) {
    this.elog = log.scope(scopePath)
  }

  /** 子作用域：desktop:tab → desktop:tab:xxx */
  scope(name: string): Logger {
    return new Logger(`${this.scopePath}:${name}`, this.options, this.fields)
  }

  /** 派生带固定身份字段的子 Logger（appId / instanceId / tabId ...） */
  child(fields: LogFields): Logger {
    return new Logger(this.scopePath, this.options, { ...this.fields, ...fields })
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.write('debug', message, metadata)
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.write('info', message, metadata)
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.write('warn', message, metadata)
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.write('error', message, metadata)
  }

  private write(level: 'debug' | 'info' | 'warn' | 'error', message: string, metadata?: Record<string, unknown>): void {
    // debug 受开关控制：生产环境默认不产生，避免刷屏与性能损耗
    if (level === 'debug' && !this.options.debug)
      return

    const data = { ...this.fields, ...metadata }
    const entries = Object.entries(data).filter(([, value]) => value !== undefined)
    if (entries.length === 0)
      this.elog[level](message)
    else
      this.elog[level](message, Object.fromEntries(entries))
  }
}

/**
 * 根 Logger：一次性配置 electron-log 传输分级。
 * 文件路径用 electron-log 默认值（userData/logs/main.log，超 1MB 自动轮转 .old）。
 * - 文件：dev 全量（含 debug），生产从 info 起
 * - 控制台：dev 全量，生产仅 error（避免污染终端）
 */
export function createRootLogger(options: LoggerOptions = {}): Logger {
  log.transports.file.level = options.debug ? 'debug' : 'info'
  log.transports.console.level = options.debug ? 'debug' : 'error'
  return new Logger(options.scope ?? 'desktop', options)
}
