import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * 更新体系端到端验证服务器（仅本地测试用）：
 * - asar 热更：/updates/asar-manifest.json + core-1.0.1.asar（来自 pnpm hotfix 产物）
 * - 整包更新：/updates/latest.yml（sha512 实时计算）+ 整包 exe（dist 根下探测）
 * 断言依据：客户端日志与 userData/desktop-updater 文件状态，服务器只负责真实供流。
 * 用法：pnpm exec tsx scripts/e2e-update-server.ts [app]（默认 desktop，如 kiosk）
 */

const APP = process.argv[2] ?? 'desktop'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'apps', APP, 'dist')
const HOTFIX = join(DIST, 'hotfix')
const PORT = Number(process.env.E2E_UPDATE_PORT ?? 8799)

const hotfixManifest = JSON.parse(readFileSync(join(HOTFIX, 'asar-manifest.json'), 'utf-8')) as {
  version: string
  url: string
  sha256: string
}
const asarFile = join(HOTFIX, `core-${hotfixManifest.version}.asar`)
// 整包 exe：命名因形态而异（desktop=Desktop-1.0.0-x64.exe / kiosk 形态=Kiosk-Setup-1.0.0.exe），从 dist 根探测
const exeFile = readdirSync(DIST)
  .filter(f => f.endsWith('.exe') && !f.includes('uninstaller'))
  .sort()
  .reverse()[0] // 命名含版本号，取字典序最大 = 最新版本产物
if (!exeFile) {
  console.error(`missing installer exe in ${DIST}`)
  process.exit(1)
}
const exePath = join(DIST, exeFile)
if (!existsSync(asarFile) || !existsSync(exePath)) {
  console.error(`missing: ${existsSync(asarFile) ? exePath : asarFile}`)
  process.exit(1)
}

function sha512Base64(file: string): string {
  return createHash('sha512').update(readFileSync(file)).digest('base64')
}

/** 每请求实时读盘：hotfix 重新生成（如 --version 提版本）后服务器无需重启 */
function readHotfix() {
  const manifest = JSON.parse(readFileSync(join(HOTFIX, 'asar-manifest.json'), 'utf-8')) as {
    version: string
    url: string
    sha256: string
  }
  return { manifest, asarPath: join(HOTFIX, `core-${manifest.version}.asar`) }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const { manifest, asarPath } = readHotfix()
  if (url.pathname === '/updates/asar-manifest.json') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(manifest))
    console.log(`[asar-manifest] ${JSON.stringify(manifest)}`)
    return
  }
  if (url.pathname === `/updates/core-${manifest.version}.asar`) {
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': statSync(asarPath).size })
    createReadStream(asarPath).pipe(res)
    console.log(`[asar] served core-${manifest.version}.asar`)
    return
  }
  if (url.pathname === '/updates/latest.yml') {
    // electron-updater generic provider：version 决定是否 available，sha512 决定校验
    const yml = [
      `version: ${manifest.version}`,
      `path: ${exeFile}`,
      `sha512: ${sha512Base64(exePath)}`,
      `releaseDate: '${new Date().toISOString()}'`,
      '',
    ].join('\n')
    res.writeHead(200, { 'content-type': 'application/octet-stream' })
    res.end(yml)
    console.log(`[latest.yml] version=${manifest.version}`)
    return
  }
  if (url.pathname === `/updates/${exeFile}`) {
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': statSync(exePath).size })
    createReadStream(exePath).pipe(res)
    console.log(`[exe] served ${exeFile}`)
    return
  }
  res.writeHead(404)
  res.end('not found')
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`e2e update server: http://127.0.0.1:${PORT}/updates/ (exe ${exeFile})`)
})
