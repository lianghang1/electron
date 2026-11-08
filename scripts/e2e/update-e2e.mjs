/**
 * 更新链路端到端：真实 HTTP 清单服务 + 真实文件系统 + 真实三通道实现类。
 * 覆盖 dist-hot（免重启热更）/ asar-hot（原子换+回滚）/ full-package（整包下载校验），
 * 以及共用清单缺段调度、origin 白名单、sha256 篡改、中断回滚。
 *
 * 运行：pnpm test:e2e:update
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { register } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

register('./electron-stub-loader.mjs', import.meta.url)

const userData = mkdtempSync(join(tmpdir(), 'shell-e2e-userdata-'))
process.env.E2E_USER_DATA = userData

const {
  AsarHotChannel,
  DistHotChannel,
  FullPackageChannel,
  UpdateCenter,
  collectAppVersions,
  finalizeAsarUpdate,
} = await import('@shell/update')

const work = mkdtempSync(join(tmpdir(), 'shell-e2e-'))
const port = Number(process.env.E2E_PORT ?? 8899)
const base = `http://127.0.0.1:${port}`
const manifestUrl = `${base}/manifest.json`

// ---- 素材：v2 应用 dist（真 zip）、新 asar、新整包安装器 ----
const v2Dir = join(work, 'v2')
mkdirSync(v2Dir)
writeFileSync(join(v2Dir, 'index.html'), '<h1>demo-packaged v2.0.0</h1>')
writeFileSync(join(v2Dir, 'version.json'), JSON.stringify({ version: '2.0.0' }))
const zipPath = join(work, 'demo-packaged-2.0.0.zip')
execFileSync('zip', ['-j', zipPath, 'index.html', 'version.json'], { cwd: v2Dir })
const asarPath = join(work, 'app-2.0.1.asar')
writeFileSync(asarPath, 'ASAR-v2.0.1')
const installerPath = join(work, 'shell-2.0.1.exe')
writeFileSync(installerPath, 'INSTALLER-v2.0.1')

const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex')
const badSha = '0'.repeat(64)
let tampered = false

const files = {
  '/demo-packaged-2.0.0.zip': zipPath,
  '/app-2.0.1.asar': asarPath,
  '/shell-2.0.1.exe': installerPath,
}

function manifest() {
  return {
    apps: { 'demo-packaged': { version: '2.0.0', url: `${base}/demo-packaged-2.0.0.zip`, sha256: tampered ? badSha : sha(zipPath) } },
    asar: { version: '2.0.1', url: `${base}/app-2.0.1.asar`, sha256: tampered ? badSha : sha(asarPath) },
    package: { version: '2.0.1', url: `${base}/shell-2.0.1.exe`, sha256: tampered ? badSha : sha(installerPath), silentArgs: '/S' },
  }
}

const server = createServer((req, res) => {
  const path = new URL(req.url, base).pathname
  if (path === '/manifest.json' || path === '/manifest-asar-only.json') {
    const data = path === '/manifest-asar-only.json' ? { asar: manifest().asar } : manifest()
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(data))
    return
  }
  const file = files[path]
  if (file) {
    res.writeHead(200)
    createReadStream(file).pipe(res)
    return
  }
  res.writeHead(404)
  res.end('not found')
})
await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(port, '127.0.0.1', resolve)
})

const allowedOrigins = [base]
const matrix = { shell: '2.0.0-alpha.0', asar: '2.0.0-alpha.0', apps: {} }
const updaterDir = join(userData, 'userData', 'desktop-updater')

const appsRoot = join(work, 'apps')
mkdirSync(join(appsRoot, 'demo-packaged'), { recursive: true })
writeFileSync(join(appsRoot, 'demo-packaged', 'index.html'), 'demo-packaged v1.0.0')
writeFileSync(join(appsRoot, 'demo-packaged', 'version.json'), JSON.stringify({ version: '1.0.0' }))

const resourcesDir = join(work, 'resources')
mkdirSync(resourcesDir, { recursive: true })
writeFileSync(join(resourcesDir, 'app.asar'), 'ASAR-v2.0.0-alpha.0')

let passed = 0
let failed = 0
async function step(name, fn) {
  try {
    await fn()
    passed++
    process.stdout.write(`  PASS  ${name}\n`)
  }
  catch (err) {
    failed++
    process.stdout.write(`  FAIL  ${name}: ${err.message}\n`)
  }
}

process.stdout.write(`\n更新链路 e2e  ${base}\n\n`)

const dist = new DistHotChannel({ appsRoot, manifestUrl, allowedOrigins })
const asar = new AsarHotChannel({ resourcesDir, manifestUrl, allowedOrigins })
const full = new FullPackageChannel({ manifestUrl, allowedOrigins })

await step('dist-hot: 1.0.0 → 2.0.0 原子替换，免重启', async () => {
  const current = { ...matrix, apps: collectAppVersions(appsRoot) }
  const plan = await dist.check(current)
  assert.equal(plan?.channel, 'dist-hot')
  assert.equal(plan?.targetVersion, '2.0.0')
  const result = await dist.apply(plan)
  assert.equal(result.ok, true)
  assert.equal(result.requiresRestart, false)
  assert.match(readFileSync(join(appsRoot, 'demo-packaged', 'index.html'), 'utf-8'), /v2\.0\.0/)
  assert.deepEqual(collectAppVersions(appsRoot), { 'demo-packaged': '2.0.0' })
  assert.equal(existsSync(join(appsRoot, '.staging-demo-packaged')), false)
  assert.equal(existsSync(join(appsRoot, '.bak-demo-packaged')), false)
})

await step('dist-hot: 热更后版本矩阵刷新，不重复更新', async () => {
  assert.equal(await dist.check({ ...matrix, apps: collectAppVersions(appsRoot) }), null)
})

await step('dist-hot: sha256 篡改被拒，正式位保持可运行版本', async () => {
  tampered = true
  try {
    const plan = await dist.check({ ...matrix, apps: { 'demo-packaged': '1.0.0' } })
    const result = await dist.apply(plan)
    assert.equal(result.ok, false)
    assert.match(result.error ?? '', /sha256 mismatch/)
    assert.match(readFileSync(join(appsRoot, 'demo-packaged', 'index.html'), 'utf-8'), /v2\.0\.0/)
    assert.equal(existsSync(join(appsRoot, '.staging-demo-packaged')), false)
  }
  finally {
    tampered = false
  }
})

await step('asar-hot: 下载标记 → finalize 原子换 → 二次 finalize 清 .bak', async () => {
  const plan = await asar.check(matrix)
  assert.equal(plan?.channel, 'asar-hot')
  const result = await asar.apply(plan)
  assert.equal(result.ok, true)
  assert.equal(result.requiresRestart, true)
  const marker = join(updaterDir, 'pending.asar.json')
  assert.match(readFileSync(marker, 'utf-8'), /"stage":"downloaded"/)
  finalizeAsarUpdate(resourcesDir)
  assert.equal(readFileSync(join(resourcesDir, 'app.asar'), 'utf-8'), 'ASAR-v2.0.1')
  assert.equal(existsSync(join(resourcesDir, 'app.asar.bak')), true)
  assert.match(readFileSync(marker, 'utf-8'), /"stage":"swapped"/)
  finalizeAsarUpdate(resourcesDir)
  assert.equal(existsSync(join(resourcesDir, 'app.asar.bak')), false)
  assert.equal(existsSync(marker), false)
})

await step('asar-hot: sha256 篡改被拒，坏 pending.asar 不残留', async () => {
  tampered = true
  try {
    const plan = await asar.check(matrix)
    const result = await asar.apply(plan)
    assert.equal(result.ok, false)
    assert.equal(existsSync(join(updaterDir, 'pending.asar')), false)
    assert.equal(existsSync(join(updaterDir, 'pending.asar.json')), false)
  }
  finally {
    tampered = false
  }
})

await step('full-package: 整包下载 + 校验 + 退出安装排程', async () => {
  const plan = await full.check(matrix)
  assert.equal(plan?.channel, 'full-package')
  assert.equal(plan?.targetVersion, '2.0.1')
  const result = await full.apply(plan)
  assert.equal(result.ok, true)
  assert.equal(result.requiresRestart, true)
  assert.equal(readFileSync(join(updaterDir, 'pending-installer.exe'), 'utf-8'), 'INSTALLER-v2.0.1')
})

await step('共用清单缺 apps 段：调度跳过 dist-hot 命中 asar-hot（不再崩）', async () => {
  const onlyAsar = `${base}/manifest-asar-only.json`
  const emitted = []
  const center = new UpdateCenter({
    channels: [
      new DistHotChannel({ appsRoot, manifestUrl: onlyAsar, allowedOrigins }),
      new AsarHotChannel({ resourcesDir, manifestUrl: onlyAsar, allowedOrigins }),
      new FullPackageChannel({ manifestUrl: onlyAsar, allowedOrigins }),
    ],
    events: { emit: (type, payload) => emitted.push({ type, payload }) },
    deviceId: 'e2e',
    versionMatrix: async () => matrix,
  })
  const plan = await center.check(matrix)
  assert.equal(plan?.channel, 'asar-hot')
  assert.ok(emitted.some(e => e.type === 'update.checked'))
})

await step('origin 白名单：清单非授信源站直接拒绝', async () => {
  const evil = new DistHotChannel({ appsRoot, manifestUrl: 'http://evil.example/manifest.json', allowedOrigins })
  await assert.rejects(() => evil.check(matrix), /origin not allowed/)
})

await step('全通道已是最新：三个 check 都返回 null', async () => {
  const latest = { shell: '2.0.1', asar: '2.0.1', apps: { 'demo-packaged': '2.0.0' } }
  assert.equal(await dist.check(latest), null)
  assert.equal(await asar.check(latest), null)
  assert.equal(await full.check(latest), null)
})

server.close()
rmSync(work, { recursive: true, force: true })
rmSync(userData, { recursive: true, force: true })
process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
process.exitCode = failed > 0 ? 1 : 0
