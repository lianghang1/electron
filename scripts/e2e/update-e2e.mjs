/**
 * 更新链路端到端：真实 HTTP 清单服务 + 真实文件系统 + 真实三通道与三平台策略实现类。
 * 覆盖 dist-hot（免重启热更）/ asar-hot（原子换+回滚）/ full-package（按平台策略整包落地），
 * 以及共用清单缺段调度、平台条目缺失、清单命令注入无效、origin 白名单、sha256 篡改、中断兜底。
 *
 * 运行：pnpm test:e2e:update
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
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
  DarwinInstaller,
  DistHotChannel,
  FullPackageChannel,
  LinuxInstaller,
  UpdateCenter,
  Win32Installer,
  collectAppVersions,
  finalizeAsarUpdate,
} = await import('@shell/update')

const work = mkdtempSync(join(tmpdir(), 'shell-e2e-'))
const port = Number(process.env.E2E_PORT ?? 8899)
const base = `http://127.0.0.1:${port}`
const manifestUrl = `${base}/manifest.json`

// ---- 素材：v2 应用 dist（真 zip）、新 asar、整包安装器（同一内容按平台后缀多址提供） ----
const v2Dir = join(work, 'v2')
mkdirSync(v2Dir)
writeFileSync(join(v2Dir, 'index.html'), '<h1>demo-packaged v2.0.0</h1>')
writeFileSync(join(v2Dir, 'version.json'), JSON.stringify({ version: '2.0.0' }))
const zipPath = join(work, 'demo-packaged-2.0.0.zip')
execFileSync('zip', ['-j', zipPath, 'index.html', 'version.json'], { cwd: v2Dir })
const asarPath = join(work, 'app-2.0.1.asar')
writeFileSync(asarPath, 'ASAR-v2.0.1')
const installerPath = join(work, 'shell-2.0.1.bin')
writeFileSync(installerPath, 'INSTALLER-v2.0.1')

const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex')
const badSha = '0'.repeat(64)
let tampered = false

const files = {
  '/demo-packaged-2.0.0.zip': zipPath,
  '/app-2.0.1.asar': asarPath,
  '/shell-2.0.1.exe': installerPath,
  '/shell-2.0.1.deb': installerPath,
  '/shell-2.0.1.AppImage': installerPath,
  '/shell-2.0.1.dmg': installerPath,
}

function pkgEntry(name, extra = {}) {
  return {
    url: `${base}/shell-2.0.1.${name}`,
    sha256: tampered ? badSha : sha(installerPath),
    ...extra,
  }
}

function manifest() {
  return {
    apps: { 'demo-packaged': { version: '2.0.0', url: `${base}/demo-packaged-2.0.0.zip`, sha256: tampered ? badSha : sha(zipPath) } },
    asar: { version: '2.0.1', url: `${base}/app-2.0.1.asar`, sha256: tampered ? badSha : sha(asarPath) },
    package: {
      version: '2.0.1',
      artifacts: { win32: pkgEntry('exe'), linux: pkgEntry('deb'), darwin: pkgEntry('dmg') },
    },
  }
}

const server = createServer((req, res) => {
  const path = new URL(req.url, base).pathname
  let data
  if (path === '/manifest.json') { data = manifest() }
  else if (path === '/manifest-asar-only.json') { data = { asar: manifest().asar } }
  else if (path === '/manifest-platform-missing.json') { data = { package: { version: '2.0.1', artifacts: { darwin: pkgEntry('dmg') } } } }
  else if (path === '/manifest-appimage.json') {
    // 对抗素材：服务端清单仍携带 command，落地命令必须只认本地注入的策略，不采信清单
    data = {
      package: {
        version: '2.0.1',
        artifacts: { linux: pkgEntry('AppImage', { command: ['cp', '{path}', '/opt/demo.AppImage'] }) },
      },
    }
  }
  else if (path === '/manifest-cross-origin.json') {
    data = {
      package: {
        version: '2.0.1',
        artifacts: { win32: { url: 'http://evil.example/x.exe', sha256: sha(installerPath) } },
      },
    }
  }
  if (data) {
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
  assert.equal(finalizeAsarUpdate(resourcesDir).ok, true)
  assert.equal(readFileSync(join(resourcesDir, 'app.asar'), 'utf-8'), 'ASAR-v2.0.1')
  assert.equal(existsSync(join(resourcesDir, 'app.asar.bak')), true)
  assert.match(readFileSync(marker, 'utf-8'), /"stage":"swapped"/)
  assert.equal(finalizeAsarUpdate(resourcesDir).ok, true)
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

await step('win32 策略: .exe 暂存 + NSIS /S 命令 + 退出只拉起一次', async () => {
  const win = new FullPackageChannel({ manifestUrl, allowedOrigins, installer: new Win32Installer() })
  const plan = await win.check(matrix)
  assert.equal(plan?.channel, 'full-package')
  const result = await win.apply(plan)
  assert.equal(result.ok, true)
  assert.equal(result.requiresRestart, true)
  const staged = join(updaterDir, 'pending-installer.exe')
  assert.equal(readFileSync(staged, 'utf-8'), 'INSTALLER-v2.0.1')
  const cmd = await new Win32Installer().prepare(staged, { url: plan.downloadUrl, sha256: '' })
  assert.equal(cmd.command, staged)
  assert.deepEqual(cmd.args, ['/S'])
  assert.equal(cmd.detached, true)
  const errors = []
  assert.equal(win.installOnQuit(err => errors.push(err.message)), true)
  assert.equal(win.installOnQuit(), false)
  await new Promise(r => setTimeout(r, 80))
  assert.ok(errors.length > 0, '安装器缺失应经 onError 上报，而不是掀翻退出流程')
})

await step('linux 策略: .deb 暂存 + pkexec/dpkg 命令 + chmod 可执行', async () => {
  const linux = new FullPackageChannel({ manifestUrl, allowedOrigins, installer: new LinuxInstaller() })
  const plan = await linux.check(matrix)
  assert.equal(plan?.downloadUrl, `${base}/shell-2.0.1.deb`)
  assert.equal(await linux.apply(plan).then(r => r.ok), true)
  const staged = join(updaterDir, 'pending-installer.deb')
  assert.equal(readFileSync(staged, 'utf-8'), 'INSTALLER-v2.0.1')
  assert.equal(statSync(staged).mode & 0o111, 0o111)
  const cmd = await new LinuxInstaller().prepare(staged, { url: plan.downloadUrl, sha256: '' })
  assert.equal(cmd.command, 'pkexec')
  assert.deepEqual(cmd.args, ['dpkg', '-i', staged])
})

await step('linux 策略: 清单 command 无效，AppImage 落地命令只来自本地注入', async () => {
  const url = `${base}/manifest-appimage.json`
  const target = '/opt/demo.AppImage'
  const linux = new FullPackageChannel({ manifestUrl: url, allowedOrigins, installer: new LinuxInstaller({ appImageTarget: target }) })
  const plan = await linux.check(matrix)
  assert.equal(plan?.downloadUrl, `${base}/shell-2.0.1.AppImage`)
  assert.equal(plan?.payload?.command, undefined, '清单下发的 command 不得进入更新计划')
  assert.equal(await linux.apply(plan).then(r => r.ok), true)
  const staged = join(updaterDir, 'pending-installer.AppImage')
  assert.equal(existsSync(staged), true)

  const artifact = { url: plan.downloadUrl, sha256: '' }
  const injected = await new LinuxInstaller({ appImageTarget: target }).prepare(staged, artifact)
  assert.equal(injected.command, 'cp')
  assert.deepEqual(injected.args, [staged, target])

  // 反向：不带本地注入的同一份清单，命令退化为直接运行，绝不执行清单里的 cp
  const plain = await new LinuxInstaller().prepare(staged, artifact)
  assert.equal(plain.command, staged)
  assert.deepEqual(plain.args, [])
})

await step('darwin 策略: .dmg 暂存 + 默认 open 命令', async () => {
  const mac = new FullPackageChannel({ manifestUrl, allowedOrigins, installer: new DarwinInstaller() })
  const plan = await mac.check(matrix)
  assert.equal(plan?.downloadUrl, `${base}/shell-2.0.1.dmg`)
  assert.equal(await mac.apply(plan).then(r => r.ok), true)
  const staged = join(updaterDir, 'pending-installer.dmg')
  assert.equal(existsSync(staged), true)
  const cmd = await new DarwinInstaller().prepare(staged, { url: plan.downloadUrl, sha256: '' })
  assert.equal(cmd.command, 'open')
  assert.deepEqual(cmd.args, [staged])
})

await step('清单缺当前平台条目: check 返回 null，不误装其他平台安装包', async () => {
  const url = `${base}/manifest-platform-missing.json`
  const win = new FullPackageChannel({ manifestUrl: url, allowedOrigins, installer: new Win32Installer() })
  assert.equal(await win.check(matrix), null)
  const mac = new FullPackageChannel({ manifestUrl: url, allowedOrigins, installer: new DarwinInstaller() })
  assert.notEqual(await mac.check(matrix), null)
})

await step('full-package: sha256 篡改被拒，暂存文件清理', async () => {
  tampered = true
  try {
    const win = new FullPackageChannel({ manifestUrl, allowedOrigins, installer: new Win32Installer() })
    const plan = await win.check(matrix)
    const result = await win.apply(plan)
    assert.equal(result.ok, false)
    assert.match(result.error ?? '', /sha256 mismatch/)
    assert.equal(existsSync(join(updaterDir, 'pending-installer.exe')), false)
    assert.equal(win.installOnQuit(), false)
  }
  finally {
    tampered = false
  }
})

await step('共用清单缺 apps 段: 调度跳过 dist-hot 命中 asar-hot（不再崩）', async () => {
  const onlyAsar = `${base}/manifest-asar-only.json`
  const emitted = []
  const center = new UpdateCenter({
    channels: [
      new DistHotChannel({ appsRoot, manifestUrl: onlyAsar, allowedOrigins }),
      new AsarHotChannel({ resourcesDir, manifestUrl: onlyAsar, allowedOrigins }),
      new FullPackageChannel({ manifestUrl: onlyAsar, allowedOrigins, installer: new Win32Installer() }),
    ],
    events: { emit: (type, payload) => emitted.push({ type, payload }) },
    deviceId: 'e2e',
    versionMatrix: async () => matrix,
  })
  const plan = await center.check(matrix)
  assert.equal(plan?.channel, 'asar-hot')
  assert.ok(emitted.some(e => e.type === 'update.checked'))
})

await step('origin 白名单: 清单与整包地址非授信源站直接拒绝', async () => {
  const evil = new DistHotChannel({ appsRoot, manifestUrl: 'http://evil.example/manifest.json', allowedOrigins })
  await assert.rejects(() => evil.check(matrix), /origin not allowed/)
  const cross = new FullPackageChannel({ manifestUrl: `${base}/manifest-cross-origin.json`, allowedOrigins, installer: new Win32Installer() })
  await assert.rejects(() => cross.check(matrix), /origin not allowed/)
})

await step('asar finalize 异常兜底: 返回 ok:false 而非抛错拖垮启动', async () => {
  const brokenDir = join(work, 'resources-broken')
  mkdirSync(brokenDir, { recursive: true })
  writeFileSync(join(brokenDir, 'app.asar'), 'LIVE')
  mkdirSync(join(brokenDir, 'app.asar.bak', 'child'), { recursive: true })
  const marker = join(updaterDir, 'pending.asar.json')
  writeFileSync(marker, JSON.stringify({ stage: 'swapped' }))
  const result = finalizeAsarUpdate(brokenDir)
  assert.equal(result.ok, false)
  assert.match(result.error ?? '', /EISDIR|ENOTEMPTY|ERR_FS/)
  assert.equal(readFileSync(join(brokenDir, 'app.asar'), 'utf-8'), 'LIVE')
  rmSync(marker, { force: true })
  rmSync(join(brokenDir, 'app.asar.bak'), { recursive: true, force: true })
})

await step('全通道已是最新: 三个 check 都返回 null', async () => {
  const latest = { shell: '2.0.1', asar: '2.0.1', apps: { 'demo-packaged': '2.0.0' } }
  assert.equal(await dist.check(latest), null)
  assert.equal(await asar.check(latest), null)
  const win = new FullPackageChannel({ manifestUrl, allowedOrigins, installer: new Win32Installer() })
  assert.equal(await win.check(latest), null)
})

server.close()
rmSync(work, { recursive: true, force: true })
rmSync(userData, { recursive: true, force: true })
process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
process.exitCode = failed > 0 ? 1 : 0
