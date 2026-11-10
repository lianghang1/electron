import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { compareVersions, logLine, MARKS, readMark, removeMark, writeMark } from './marks.mjs'

/**
 * Electron 把 *.asar 路径挂进虚拟文件系统并呈现为「目录」，
 * 引导层删除热更 asar 文件（回滚/坏包清理）必须走 original-fs，
 * 否则 rmSync 报 EISDIR，坏包与陈旧热更包永远残留。
 * 纯 Node 环境（e2e）没有 original-fs，回退 node:fs。
 */
let realFs = fs
try { realFs = createRequire(import.meta.url)('original-fs') }
catch { /* node test env */ }

/** 新版本替换后存活满该时长视为稳定；判定只看进程内定时器，对系统时钟回拨免疫 */
export const STABLE_MS = 60_000

/**
 * 上次替换后首启判活：first-run 仍在说明进程没活到稳定点。
 * 主动重启（resilience relaunch / 整包退出）会写 graceful-exit，此时只清标记不回滚——
 * 崩溃重载被误判为坏版本会让正常版本反复回退到出厂包。
 */
export function settleOrRollback(dir, log = message => logLine(dir, message)) {
  const firstRun = readMark(dir, MARKS.firstRun)
  if (!firstRun) { return 'idle' }
  if (readMark(dir, MARKS.gracefulExit)) {
    removeMark(dir, MARKS.gracefulExit)
    removeMark(dir, MARKS.firstRun)
    log('graceful relaunch, settle skipped')
    return 'graceful'
  }
  const current = readMark(dir, MARKS.current)
  try {
    if (current?.file) { realFs.rmSync(path.join(dir, current.file), { force: true }) }
    removeMark(dir, MARKS.current)
    removeMark(dir, MARKS.firstRun)
    log(`hot core rollback applied (startedAt=${firstRun.startedAt})`)
    return 'rolled-back'
  }
  catch (error) {
    log(`settle/rollback failed: ${error}`)
    return 'failed'
  }
}

/** 消费 pending：写 current 指针与首启标记，pending 保留到写指针成功 */
export function applyPending(dir, log = message => logLine(dir, message)) {
  const pending = readMark(dir, MARKS.pending)
  if (!pending?.file || !pending?.version) { return null }
  const asar = path.join(dir, pending.file)
  if (!fs.existsSync(asar)) {
    removeMark(dir, MARKS.pending)
    log(`pending file missing: ${pending.file}`)
    return null
  }
  try {
    writeMark(dir, MARKS.current, {
      version: pending.version,
      file: pending.file,
      appliedAt: Date.now(),
    })
    writeMark(dir, MARKS.firstRun, { startedAt: Date.now(), version: pending.version })
    removeMark(dir, MARKS.pending)
    log(`hot core applied: ${pending.version} (${pending.file})`)
    return pending
  }
  catch (error) {
    log(`apply pending failed (kept for next launch): ${error}`)
    return null
  }
}

/**
 * 候选核心包：整包更新后内置版本新于热更版本时清掉陈旧热更包，
 * 否则旧热更代码会压制新内置代码一次启动周期。
 */
export function planCandidates(dir, builtinRoot, builtinVersion, log = message => logLine(dir, message)) {
  let current = readMark(dir, MARKS.current)
  if (current?.version && compareVersions(builtinVersion, current.version) > 0) {
    try {
      if (current.file) { realFs.rmSync(path.join(dir, current.file), { force: true }) }
      removeMark(dir, MARKS.current)
      removeMark(dir, MARKS.firstRun)
      log(`stale hot core ${current.version} < builtin ${builtinVersion}, cleaned`)
    }
    catch (error) {
      log(`stale hot cleanup failed: ${error}`)
    }
    current = null
  }
  const hotRoot = current?.file ? path.join(dir, current.file) : null
  const candidates = []
  if (hotRoot && fs.existsSync(hotRoot)) { candidates.push({ label: 'hot', root: hotRoot, version: current.version }) }
  candidates.push({ label: 'builtin', root: builtinRoot, version: builtinVersion })
  return candidates
}

/** 进程内定时器删首启标记：进程早死则标记留存，下次启动由 settleOrRollback 回滚 */
export function scheduleStableClear(dir, delayMs = STABLE_MS) {
  const timer = setTimeout(() => {
    try { removeMark(dir, MARKS.firstRun) }
    catch (error) { logLine(dir, `stable mark clear failed: ${error}`) }
  }, delayMs)
  timer.unref?.()
  return timer
}

/**
 * 启动时序：判活 → 消费 pending → 选候选 → 依次加载 → 启动成功后排稳定计时。
 * loadCore 由入口注入（真实 Electron 里是跨 asar import，测试里是纯函数），
 * 返回 reject 表示启动失败，引导器继续尝试下一个候选而不排稳定计时。
 */
export async function bootSequence({ dir, builtinRoot, builtinVersion, loadCore, log = message => logLine(dir, message) }) {
  settleOrRollback(dir, log)
  applyPending(dir, log)
  const candidates = planCandidates(dir, builtinRoot, builtinVersion, log)
  for (const candidate of candidates) {
    try {
      await loadCore(candidate)
      log(`loaded ${candidate.label} core from ${candidate.root}`)
      scheduleStableClear(dir)
      return { ...candidate, settled: true }
    }
    catch (error) {
      log(`failed to load ${candidate.label} core: ${error}`)
      if (candidate.label === 'hot') {
        try {
          realFs.rmSync(candidate.root, { force: true })
          removeMark(dir, MARKS.current)
          removeMark(dir, MARKS.firstRun)
          log('broken hot core removed, falling back to builtin')
        }
        catch (cleanupError) { log(`broken hot core cleanup failed: ${cleanupError}`) }
      }
    }
  }
  log('no core could be loaded')
  return null
}
