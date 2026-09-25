import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import process from 'node:process'

/**
 * asar 热更联调用本地静态更新服务器（sha256 实时计算，无需手工生成清单）：
 *   node scripts/update-test-server.mjs <asar 文件> [版本号] [端口]
 * 路由：
 *   GET /updates/asar-manifest.json  → { version, url, sha256 }
 *   GET /updates/core-<version>.asar → asar 文件流（带 content-length 供进度推送）
 */
const [file, version = '1.0.1', port = '8765'] = process.argv.slice(2)
if (!file || !existsSync(file)) {
  console.error('usage: node scripts/update-test-server.mjs <asar file> [version] [port]')
  process.exit(1)
}

const fileName = `core-${version}.asar`
const sha256 = await new Promise((resolve, reject) => {
  const hash = createHash('sha256')
  createReadStream(file)
    .on('data', chunk => hash.update(chunk))
    .on('end', () => resolve(hash.digest('hex')))
    .on('error', reject)
})

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/updates/asar-manifest.json') {
    const manifest = { version, url: `/updates/${fileName}`, sha256 }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(manifest))
    console.log(`[manifest] ${JSON.stringify(manifest)}`)
    return
  }
  if (url.pathname === '/apps/registry.json') {
    // 远程 App 源联调（apps.remoteUrl）：结构必须过 isAppManifest 校验
    const apps = [{
      id: 'wiki',
      name: 'Wiki',
      version: '1.0.0',
      type: 'internal',
      entry: { type: 'web', url: 'https://example.com' },
      permissions: [],
    }]
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(apps))
    console.log('[apps] remote registry served')
    return
  }
  if (url.pathname === '/updates/latest.yml') {
    // 整包更新器占位清单：version 与当前一致 → 无整包更新，消除联调噪音
    res.writeHead(200, { 'content-type': 'application/octet-stream' })
    res.end(`version: 1.0.0\npath: Desktop-1.0.0-x64.exe\nsha512: ${Buffer.from('placeholder').toString('base64')}\nreleaseDate: '2026-09-25T00:00:00.000Z'\n`)
    console.log('[latest.yml] served (whole-package updater: up to date)')
    return
  }
  if (url.pathname === `/updates/${fileName}`) {
    const size = statSync(file).size
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': size })
    createReadStream(file).pipe(res)
    console.log(`[download] ${fileName} (${size} bytes)`)
    return
  }
  res.writeHead(404)
  res.end('not found')
})

server.listen(Number(port), '127.0.0.1', () => {
  console.log(`update test server: http://127.0.0.1:${port}/updates/asar-manifest.json (${fileName}, sha256=${sha256.slice(0, 12)}...)`)
})
