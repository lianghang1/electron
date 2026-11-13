/**
 * 壳渲染层截图 harness：脱离真实主进程，用 mock 桥渲染 out/renderer 产物，
 * 对顶栏/整窗截图落盘，供代理目检 UI（启动视觉、顶栏布局、档位形态）。
 *
 * 用法（先 pnpm --filter @app/shell build）：
 *   npx electron scripts/shell-shot/main.cjs --shot-name=platform-tabs --shot-chrome=platform --shot-mode=windowed --shot-tabs=2
 */
const { existsSync, mkdirSync } = require('node:fs')
const { readFile } = require('node:fs/promises')
const { createServer } = require('node:http')
const { extname, join } = require('node:path')
const process = require('node:process')
const { app, BrowserWindow } = require('electron')

const args = process.argv
function arg(name, fallback) {
  const hit = args.find(a => a.startsWith(`--shot-${name}=`))
  return hit ? hit.slice(name.length + 8) : fallback
}
const name = arg('name', 'shot')
const chrome = arg('chrome', 'platform')
const mode = arg('mode', 'windowed')
const tabs = arg('tabs', '0')
const appsCount = arg('apps', '')
const withFail = arg('fail', '') !== ''

const WIDTH = Number(arg('width', '1280'))
const HEIGHT = Number(arg('height', '800'))
const rendererRoot = join(__dirname, '..', '..', 'apps', 'shell', 'out', 'renderer')
const outDir = join(__dirname, 'out')

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

if (!existsSync(join(rendererRoot, 'index.html'))) {
  console.error(`[shell-shot] renderer 产物不存在：${rendererRoot} —— 先跑 pnpm --filter @app/shell build`)
  process.exit(1)
}

const server = createServer(async (req, res) => {
  const urlPath = (req.url ?? '/').split('?')[0].replace(/\\/g, '/')
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '')
  const file = join(rendererRoot, ...rel.split('/').filter(seg => seg && seg !== '..'))
  try {
    const data = await readFile(file)
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(data)
  }
  catch {
    res.writeHead(404)
    res.end('not found')
  }
})

function waitFor(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

app.whenReady().then(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  const win = new BrowserWindow({
    // 可见窗口：隐藏窗合成器持有陈旧帧，rect 捕获也拿不到一致新帧；
    // 短暂闪现换截图可靠性，顺带真实复现用户启动观感
    show: true,
    width: WIDTH,
    height: HEIGHT,
    webPreferences: {
      preload: join(__dirname, 'mock-preload.cjs'),
      sandbox: true,
      additionalArguments: [
        `--shot-chrome=${chrome}`,
        `--shot-mode=${mode}`,
        `--shot-tabs=${tabs}`,
        `--shot-apps=${appsCount}`,
        `--shot-fail=${withFail}`,
      ],
    },
  })

  // 渲染层取证：console / preload 加载失败 / 导航失败 / 渲染进程崩溃全部上浮
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) { console.log(`[console:${level}] ${message} (${sourceId}:${line})`) }
  })
  win.webContents.on('preload-error', (_e, path, err) => {
    console.error(`[preload-error] ${path}: ${err}`)
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[did-fail-load] ${code} ${desc} ${url}`)
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error(`[render-process-gone] ${JSON.stringify(details)}`)
  })

  await win.loadURL(`http://127.0.0.1:${port}/index.html`)
  // 600ms 事件派发 + Vue 更新 + 字体/过渡稳定
  await waitFor(1400)

  // DOM 审计：断言关键 UI 节点在位（截图目检之外的机器证据）
  const audit = await win.webContents.executeJavaScript(`({
    ready: document.body.classList.contains('ready'),
    splashGone: !document.getElementById('splash'),
    appChildren: document.getElementById('app')?.childElementCount ?? -1,
    headerButtons: document.querySelectorAll('header button').length,
    clock: !!document.querySelector('.clock'),
    tabs: document.querySelectorAll('.tab').length,
    omni: !!document.querySelector('.omnibox'),
    marks: [...document.querySelectorAll('.tab-mark')].map(m => m.textContent.trim()),
    idleTitle: document.querySelector('.tab-idle')?.getAttribute('title') ?? null,
    activeBg: getComputedStyle(document.querySelector('.tab-active') ?? document.body).backgroundColor,
    activeColor: getComputedStyle(document.querySelector('.tab-active') ?? document.body).color,
    headerKids: [...(document.querySelector('header')?.children ?? [])].slice(0, 4).map(el => el.tagName + '|' + [...el.classList].slice(0, 3).join('.') + '|' + getComputedStyle(el).borderRightWidth + '|' + getComputedStyle(el).backgroundColor),
    purpleScan: [...document.querySelectorAll('body *')].filter(el => { const b = getComputedStyle(el).backgroundColor; return b.includes('139, 92, 246') || b.includes('rgb(139') }).slice(0, 6).map(el => el.tagName + '|' + [...el.classList].slice(0, 3).join('.') + '|' + JSON.stringify(el.getBoundingClientRect().toJSON())),
  })`, true)
  console.log(`[audit] ${JSON.stringify(audit, null, 1)}`)

  const probe = await win.webContents.executeJavaScript(`(() => {
    const el = document.querySelector('.clock')
    if (!el) { return null }
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const p = el.parentElement.getBoundingClientRect()
    return { text: el.textContent, rect: [r.x, r.y, r.width, r.height], parent: [p.x, p.y, p.width, p.height],
      color: cs.color, fontSize: cs.fontSize, opacity: cs.opacity, visibility: cs.visibility, zIndex: cs.zIndex,
      position: cs.position, bg: getComputedStyle(el.parentElement).backgroundImage.slice(0, 60) }
  })()`, true)
  console.log(`[probe] ${JSON.stringify(probe)}`)

  mkdirSync(outDir, { recursive: true })
  // 隐藏窗的无参 capturePage 会返回陈旧合成帧，rect 捕获强制新帧：整窗也走 rect
  const full = await win.webContents.capturePage({ x: 0, y: 0, width: WIDTH, height: HEIGHT })
  await writeFileP(join(outDir, `${name}-full.png`), full.toPNG())
  const top = await win.webContents.capturePage({ x: 0, y: 0, width: WIDTH, height: Math.min(72, HEIGHT) })
  await writeFileP(join(outDir, `${name}-top.png`), top.toPNG())

  console.log(`[shell-shot] ${name} → ${outDir}`)
  server.close()
  app.quit()
})

function writeFileP(file, data) { return require('node:fs/promises').writeFile(file, data) }
