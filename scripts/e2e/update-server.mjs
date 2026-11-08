/**
 * 常驻更新清单服务：供真实打包应用（flavor=update-e2e）在运行时自检热更。
 * 运行：node scripts/e2e/update-server.mjs（默认 127.0.0.1:8899，与 flavor.json 一致）
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

const port = Number(process.env.E2E_PORT ?? 8899)
const base = `http://127.0.0.1:${port}`
const work = mkdtempSync(join(tmpdir(), 'shell-update-server-'))

const v2Dir = join(work, 'v2')
mkdirSync(v2Dir, { recursive: true })
writeFileSync(join(v2Dir, 'index.html'), '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>演示打包应用</title></head><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f6fbfa;color:#0f766e"><main style="text-align:center"><h1 style="font-size:42px;margin:0">demo-packaged v2.0.0</h1><p style="color:#0d9488">dist-hot 热更新已生效 · 免重启</p></main></body></html>')
writeFileSync(join(v2Dir, 'version.json'), JSON.stringify({ version: '2.0.0' }))
const zipPath = join(work, 'demo-packaged-2.0.0.zip')
execFileSync('zip', ['-j', zipPath, 'index.html', 'version.json'], { cwd: v2Dir })
const sha256 = createHash('sha256').update(readFileSync(zipPath)).digest('hex')

const manifest = {
  apps: {
    'demo-packaged': { version: '2.0.0', url: `${base}/demo-packaged-2.0.0.zip`, sha256 },
  },
}

createServer((req, res) => {
  const path = new URL(req.url, base).pathname
  process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${req.method} ${path}\n`)
  if (path === '/manifest.json') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(manifest))
    return
  }
  if (path === '/demo-packaged-2.0.0.zip') {
    res.writeHead(200, { 'content-type': 'application/zip' })
    createReadStream(zipPath).pipe(res)
    return
  }
  res.writeHead(404)
  res.end('not found')
}).listen(port, '127.0.0.1', () => {
  process.stdout.write(`update server ${base}  zip sha256=${sha256}\n`)
})
