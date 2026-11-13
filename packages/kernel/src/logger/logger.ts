import type { LogFunctions } from 'electron-log'
import fs from 'node:fs'
import path from 'node:path'
import log from 'electron-log/main'
import { logsDir } from '../storage/app-paths'

/** 历史日志保留天数，超期文件在启动时清理 */
const LOG_RETENTION_DAYS = 14

export type LogFields = Record<string, string | number | boolean | undefined>

export interface LoggerOptions {
  /** debug 日志开关（默认关闭，避免影响用户），dev 模式由 Application 打开 */
  debug?: boolean
  /** 根作用域名，缺省 'main'；Application 按启动的 App 传入（appId 末段） */
  scope?: string
}

/**
 * 平台日志：基于 electron-log（console + 文件轮转 + 崩溃捕获），自身不能成为故障点。
 * - scope(name)：模块作用域，路径式叠加（main → main:tab）
 * - child(fields)：固定身份字段（appId / instanceId / tabId ...）随每条日志输出
 */
export class Logger {
  private readonly elog: LogFunctions

  constructor(
    private readonly scopePath: string = 'main',
    private readonly options: LoggerOptions = {},
    private readonly fields: LogFields = {},
  ) {
    this.elog = log.scope(scopePath)
  }

  /** 子作用域：main:tab → main:tab:xxx */
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
    if (level === 'debug' && !this.options.debug) { return }

    const data = { ...this.fields, ...metadata }
    const entries = Object.entries(data).filter(([, value]) => value !== undefined)
    if (entries.length === 0) { this.elog[level](message) }
    else { this.elog[level](message, Object.fromEntries(entries)) }
  }
}

/**
 * 根 Logger：一次性配置 electron-log 传输分级与文件轮转。
 * 文件目录为平台统一日志目录（userData/platform/logs，见 app-paths.ts），按天拆分为
 * main-YYYY-MM-DD.log，单日超 1MB 追加序号轮转，历史日志保留 LOG_RETENTION_DAYS 天。
 * - 文件：dev 全量（含 debug），生产从 info 起
 * - 控制台：dev 全量，生产仅 error（避免污染终端）
 */
export function createRootLogger(options: LoggerOptions = {}): Logger {
  log.transports.file.level = options.debug ? 'debug' : 'info'
  log.transports.console.level = options.debug ? 'debug' : 'error'
  configureFileRotation()
  return new Logger(options.scope ?? 'main', options)
}

/** 当天日期文本（本地时区），用于日志文件命名 */
function toDateText(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * 按天拆分日志文件并清理历史日志：
 * - resolvePathFn 在每条消息写入时都会重新解析，文件名携带当天日期，跨天自动切换新文件
 * - 同一天超过 maxSize 时追加序号轮转（main-2026-10-16.1.log），
 *   替代默认的 .old 重命名（同名覆盖会丢失当日轮转块）
 * - 启动时按文件修改时间清理超过保留期的历史日志（含旧版 main.log / main.old.log）
 */
function configureFileRotation(): void {
  log.transports.file.resolvePathFn = () => {
    return path.join(logsDir(), `main-${toDateText(new Date())}.log`)
  }

  log.transports.file.archiveLogFn = (file) => {
    const info = path.parse(file.path)
    let index = 1
    let target = path.join(info.dir, `${info.name}.${index}${info.ext}`)
    while (fs.existsSync(target)) {
      index += 1
      target = path.join(info.dir, `${info.name}.${index}${info.ext}`)
    }
    try {
      fs.renameSync(file.path, target)
    }
    catch (error) {
      // 重命名失败（如文件被占用）时清空当前文件兜底，避免单文件无限增长
      file.clear()
      console.warn('rotate log file failed:', error)
    }
  }

  const currentFile = log.transports.file.getFile()
  cleanExpiredLogs(path.dirname(currentFile.path))
}

/** 清理超过保留期的历史日志文件（按文件修改时间判断） */
function cleanExpiredLogs(logDir: string): void {
  let fileNames: string[]
  try {
    fileNames = fs.readdirSync(logDir)
  }
  catch {
    // 目录不存在（首次运行）等场景直接跳过：日志系统自身不能成为故障点
    return
  }

  const deadline = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
  for (const fileName of fileNames) {
    if (!fileName.startsWith('main')) {
      continue
    }
    const filePath = path.join(logDir, fileName)
    try {
      const stat = fs.statSync(filePath)
      if (stat.isFile() && stat.mtimeMs < deadline) {
        fs.rmSync(filePath, { force: true })
      }
    }
    catch {
      // 单个文件清理失败不阻断其余文件
    }
  }
}
