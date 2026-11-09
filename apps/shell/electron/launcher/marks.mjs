import fs from 'node:fs'
import path from 'node:path'

/**
 * 引导层与核心包共用的指针文件名。引导器 asar 永不热更，这些名字是跨版本契约，
 * 改名会让已部署设备丢失 current / pending 指针。
 */
export const MARKS = Object.freeze({
  pending: 'pending.json',
  current: 'current.json',
  firstRun: 'first-run.json',
  gracefulExit: 'graceful-exit.json',
  appsCurrent: 'apps-current.json',
  log: 'launcher.log',
})

/** BOM 容错：手工构造或编辑器写入的 JSON 带 BOM 时 JSON.parse 会抛错 */
export function readMark(dir, name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8').replace(/^\uFEFF/, ''))
  }
  catch {
    return null
  }
}

export function writeMark(dir, name, value) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, name), JSON.stringify(value))
}

export function removeMark(dir, name) {
  fs.rmSync(path.join(dir, name), { force: true })
}

/** 引导层日志落 userData：安装目录在多端下可能只读，stdout 不能作为唯一证据 */
export function logLine(dir, message) {
  try {
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, MARKS.log)
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${message}\n`)
    if (fs.statSync(file).size > 1024 * 1024) { fs.renameSync(file, `${file}.old`) }
  }
  catch {
    console.error(`[launcher] ${message}`)
  }
}

/**
 * 语义版本比较（>0 表示 a 新于 b）。引导器不能依赖核心包里的 TS 实现，
 * 故保留一份纯 JS；一致性由 scripts/e2e/launcher-e2e.mjs 与 @shell/shared 双向校验。
 */
export function compareVersions(a, b) {
  const [coreA, preA] = splitRelease(String(a))
  const [coreB, preB] = splitRelease(String(b))
  const pa = coreA.split('.')
  const pb = coreB.split('.')
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const av = pa[i] ?? '0'
    const bv = pb[i] ?? '0'
    const an = Number.parseInt(av, 10)
    const bn = Number.parseInt(bv, 10)
    if (!Number.isNaN(an) && !Number.isNaN(bn)) {
      if (an !== bn) { return an - bn }
    }
    else if (av !== bv) { return av < bv ? -1 : 1 }
  }
  return comparePreRelease(preA, preB)
}

function splitRelease(version) {
  const withoutBuild = version.split('+')[0] ?? version
  const dash = withoutBuild.indexOf('-')
  return dash === -1
    ? [withoutBuild, '']
    : [withoutBuild.slice(0, dash), withoutBuild.slice(dash + 1)]
}

function comparePreRelease(a, b) {
  if (!a && !b) { return 0 }
  if (!a) { return 1 }
  if (!b) { return -1 }
  const pa = a.split('.')
  const pb = b.split('.')
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const av = pa[i]
    const bv = pb[i]
    if (av === undefined) { return -1 }
    if (bv === undefined) { return 1 }
    const an = /^\d+$/.test(av)
    const bn = /^\d+$/.test(bv)
    if (an && bn) {
      const diff = Number.parseInt(av, 10) - Number.parseInt(bv, 10)
      if (diff !== 0) { return diff }
    }
    else if (an !== bn) { return an ? -1 : 1 }
    else if (av !== bv) { return av < bv ? -1 : 1 }
  }
  return 0
}
