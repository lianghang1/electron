const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
/**
 * 平台引导器（打包进 resources/app.asar，KB 级，永不更新）：
 * 启动早期完成 asar 热更的「指针切换」，然后动态加载真实应用代码包。
 * 全 app 共享本文件（packages/core/launcher），接入见 packages/core/scripts/after-pack.cjs；
 * asar 内的 package.json 由钩子按各 app 打包元数据动态生成（name 决定 userData，version 决定 app.getVersion）。
 *
 * 包结构（package.json main 与真实包一致指向 out/main/index.cjs，
 * electron-builder 打包后完整性检查按此路径验证）：
 *   resources/app.asar      ← 本引导器（out/main/index.cjs 即引导代码）
 *   resources/app.core.asar ← 真实全量应用代码（afterPack 由 electron-builder 产物改名而来）
 *
 * 热更布局（<userData>/desktop-updater/）：
 *   core-<version>.asar ← 各版本热更包（文件名带版本，下载即终名，永不 rename——规避文件锁）
 *   current.json        ← 当前生效指针 { version, file, appliedAt }
 *   pending.json        ← 待生效标记 { version, file, sha256 }（AsarUpdateService 校验通过后写入）
 *   first-run.json      ← 替换后首启判活标记 { startedAt }（仅日志参考；存活判定看文件存在性，
 *                         loadCore 稳定后经进程内定时器删除——对系统时钟回拨免疫）
 *
 * 时序保证：替换只发生在 userData 内的指针文件写入，零 rename、零文件锁冲突；
 * 与安装位置（含 Program Files）写权限无关。
 */
const { app } = require('electron')
// Electron 将 *.asar 后缀路径代理为 asar 虚拟文件系统：fs.rmSync 对真实 asar 文件按目录处理
// 会报 ERR_FS_EISDIR，删除热更包必须改用未打补丁的 original-fs
const ofs = require('original-fs')

const UPDATER_DIR = () => path.join(app.getPath('userData'), 'desktop-updater')
/** 替换后首启存活判定：超过该时长视为新包稳定 */
const STABLE_MS = 60_000
// 内置包版本基准：asar 根 package.json 由 afterPack 按 app 打包元数据生成（本文件在 out/main 下，根在两级之上）
const BUILTIN_VERSION = require('../../package.json').version ?? '0.0.0'

/** 版本比较（>0: a 新于 b），与 AsarUpdateService.compareVersions 同规则（改动需两侧同步，
 * 一致性由 packages/core/test/version-consistency.test.ts 强制）。
 * semver 规则：核心数字段逐段比较、缺段补 0；核心相等时带预发布的更旧，预发布标识符
 * 逐段比较（数值 < 字母、前缀相同段少者旧）；'+ 构建元数据' 忽略。
 * 不得返回 NaN——NaN 会让"清单是否更新"的判定失效（每次启动重复下载） */
function compareVersions(a, b) {
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
      if (an !== bn)
        return an - bn
    } else if (av !== bv) {
      return av < bv ? -1 : 1
    }
  }
  return comparePreRelease(preA, preB)
}

/** 拆分 semver 形状：核心段（第一个 '-' 之前）与预发布段分离，'+ 构建元数据' 忽略 */
function splitRelease(version) {
  const withoutBuild = version.split('+')[0] ?? version
  const dashIndex = withoutBuild.indexOf('-')
  if (dashIndex === -1)
    return [withoutBuild, '']
  return [withoutBuild.slice(0, dashIndex), withoutBuild.slice(dashIndex + 1)]
}

/** 预发布序：无预发布 = 正式版，新于任何预发布；都有则逐段比较（数值 < 字母、段少者旧） */
function comparePreRelease(a, b) {
  if (!a && !b)
    return 0
  if (!a)
    return 1
  if (!b)
    return -1
  const pa = a.split('.')
  const pb = b.split('.')
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const av = pa[i]
    const bv = pb[i]
    if (av === undefined)
      return -1
    if (bv === undefined)
      return 1
    const an = /^\d+$/.test(av)
    const bn = /^\d+$/.test(bv)
    if (an && bn) {
      const diff = Number.parseInt(av, 10) - Number.parseInt(bv, 10)
      if (diff !== 0)
        return diff
    } else if (an !== bn) {
      return an ? -1 : 1
    } else if (av !== bv) {
      return av < bv ? -1 : 1
    }
  }
  return 0
}

function readJson(file) {
  try {
    // strip BOM：容错手工构造/编辑器写入的带 BOM 文件（JSON.parse 不接受 BOM）
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
  }
  catch {
    return null
  }
}

function log(message) {
  try {
    const dir = UPDATER_DIR()
    fs.mkdirSync(dir, { recursive: true })
    const line = `[${new Date().toISOString()}] ${message}\n`
    const logFile = path.join(dir, 'launcher.log')
    fs.appendFileSync(logFile, line)
    if (fs.statSync(logFile).size > 1024 * 1024)
      fs.renameSync(logFile, `${logFile}.old`)
  }
  catch {}
  console.error(`[launcher] ${message}`)
}

/**
 * 上次替换后的首启判活：first-run.json 仍在 = 上次启动未存活满 STABLE_MS
 * （该标记由 loadCore 稳定后经进程内定时器删除，进程早死则留存）→ 回滚到内置包。
 * 判定只看文件存在性，对系统时钟回拨 / NTP 校时免疫；孤儿热更包清理由
 * AsarUpdateService 下载新包时执行（下载即清）。
 */
function settleOrRollback() {
  const dir = UPDATER_DIR()
  const currentPath = path.join(dir, 'current.json')
  const firstRun = readJson(path.join(dir, 'first-run.json'))
  if (!firstRun)
    return
  const current = readJson(currentPath)
  try {
    if (current?.file)
      ofs.rmSync(path.join(dir, current.file), { force: true })
    fs.rmSync(currentPath, { force: true })
    log(`hot asar rollback applied (last run died too fast, startedAt=${firstRun.startedAt})`)
    fs.rmSync(path.join(dir, 'first-run.json'), { force: true })
  }
  catch (error) {
    log(`settle/rollback failed: ${error}`)
  }
}

/** 稳定判定：成功加载核心后经进程内定时器删除首启标记（对墙钟免疫）；进程早死则标记留存待回滚 */
function scheduleStableClear() {
  setTimeout(() => {
    try {
      fs.rmSync(path.join(UPDATER_DIR(), 'first-run.json'), { force: true })
    }
    catch (error) {
      log(`stable mark clear failed: ${error}`)
    }
  }, STABLE_MS)
}

/** 消费 pending 标记：切换 current 指针指向新热更包（sha256 已由 AsarUpdateService 校验） */
function applyPending() {
  const dir = UPDATER_DIR()
  const pendingPath = path.join(dir, 'pending.json')
  const pending = readJson(pendingPath)
  if (!pending || !pending.file || !pending.version)
    return
  const newAsar = path.join(dir, pending.file)
  try {
    if (!fs.existsSync(newAsar)) {
      // 永久性缺失：清标记，等 AsarUpdateService 重新下载
      fs.rmSync(pendingPath, { force: true })
      throw new Error(`${pending.file} missing`)
    }
    fs.writeFileSync(
      path.join(dir, 'current.json'),
      JSON.stringify({ version: pending.version, file: pending.file, appliedAt: Date.now() }),
    )
    fs.writeFileSync(path.join(dir, 'first-run.json'), JSON.stringify({ startedAt: Date.now() }))
    fs.rmSync(pendingPath, { force: true })
    log(`hot asar applied: ${pending.version} (${pending.file})`)
  }
  catch (error) {
    // 保留 pending 标记：暂时性 IO 错误下次启动重试
    log(`apply pending failed (kept for next launch): ${error}`)
  }
}

/** 优先加载热更包，失败自动回退内置包（防热更包损坏变砖） */
async function loadCore() {
  const dir = UPDATER_DIR()
  // __dirname = resources/app.asar/out/main → 内置真实代码包在同级 app.core.asar
  const builtinRoot = path.join(__dirname, '..', '..', '..', 'app.core.asar')
  const currentPath = path.join(dir, 'current.json')
  let current = readJson(currentPath)

  // 版本单调：内置包比热更包新（整包更新后的首次启动）时清掉陈旧热更，
  // 直接回内置包——否则旧热更代码会压制新内置代码一次启动周期
  if (current?.version && compareVersions(BUILTIN_VERSION, current.version) > 0) {
    try {
      if (current.file)
        ofs.rmSync(path.join(dir, current.file), { force: true })
      fs.rmSync(currentPath, { force: true })
      log(`stale hot asar ${current.version} < builtin ${BUILTIN_VERSION}, cleaned`)
    }
    catch (error) {
      log(`stale hot cleanup failed: ${error}`)
    }
    current = null
  }

  const hotRoot = current?.file ? path.join(dir, current.file) : null
  const hasHot = Boolean(hotRoot) && fs.existsSync(hotRoot)
  const candidates = hasHot ? [['hot', hotRoot], ['builtin', builtinRoot]] : [['builtin', builtinRoot]]

  for (const [label, root] of candidates) {
    try {
      // 主进程 bundle 为 CJS（共享 vite 工厂固定输出 out/main/index.cjs），import() 走 CJS interop
      await import(pathToFileURL(path.join(root, 'out', 'main', 'index.cjs')).href)
      log(`loaded ${label} core from ${root}`)
      scheduleStableClear()
      return
    }
    catch (error) {
      log(`failed to load ${label} core: ${error}`)
      if (label === 'hot') {
        try {
          ofs.rmSync(hotRoot, { force: true })
          fs.rmSync(currentPath, { force: true })
          log('broken hot asar removed, falling back to builtin')
        }
        catch {}
      }
    }
  }
  log('no core could be loaded')
}

// Electron 主入口 = 本文件（require.main 指向自身）时执行启动时序；
// 被测试环境导入时跳过副作用，仅暴露时序函数与版本比较供单测
if (require.main === module) {
  settleOrRollback()
  applyPending()
  loadCore()
}

module.exports = { compareVersions, settleOrRollback, applyPending, scheduleStableClear }
