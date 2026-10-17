import type { DesktopAppManifest } from '@desktop/shared'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import process from 'node:process'
import { bootstrap, resolveResourcePath } from '@desktop/core'
import { app, protocol } from 'electron'
import icon from '../../resources/icon.png?asset'
import { appId, productName } from '../identity.cjs'

// 仅 Windows：全屏浮层（拍摄/授权弹窗/右键菜单）盖住主窗时，Chromium 原生遮挡计算
// 会把主窗判为完全遮挡而暂停渲染合成——浮层下页面逻辑照跑但画面不更新，结果/提示
// 拖到浮层关闭后才上屏。禁用该特性保持主窗持续合成（mac/Linux 无此遮挡机制，不动）
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
}

// 内部 App 页面协议：app://<appId>/index.html。
// standard + secure 使其成为标准安全源——cookie / origin 语义等同 https（file:// 源禁止写 cookie），
// 且 web-service 的 origin 守卫（弹窗受管 / 导航拦截）按 origin 比对自动兼容。
// registerSchemesAsPrivileged 必须在 app ready 前调用（模块顶层）；
// 处理器经 bootstrap.protocols 注入，由 core 挂到每个 App 的 persist 分区 Session 上。
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

/**
 * 内部 App 的磁盘根：resources/apps（根 resources 统一约定）。
 * resolveResourcePath 双路径：dev 解析 <appRoot>/resources/apps，打包解析
 * <resourcesPath>/resources/apps（electron-builder extraResources 落点，asar 外真实目录）。
 * 刻意不走 ?asset：?asset 只发射锚点文件本身到 out/main/chunks，兄弟 assets 不跟随，
 * 目录模式必须按真实目录解析。
 */
const internalAppsRoot = resolveResourcePath('resources/apps')

/** appId → 内部页磁盘目录，目录模式按 pathname 提供文件 */
const appDirs: Record<string, string> = {
  devices: join(internalAppsRoot, 'devices'),
  lab: join(internalAppsRoot, 'lab'),
}

/** 目录模式支持的静态资源类型：未知扩展名一律 404，不给任意文件读取留口子 */
const assetMimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

const appEntryUrl = (id: string): string => `app://${id}/index.html`

/**
 * app://lab/slow-download：慢速下载测试路由。
 * 同源直链 + Content-Disposition 走平台下载域，流式限速（20MB @ ≈10MB/s）让
 * progressing 态持续数秒——blob 下载写盘过快，进度条一闪而过无法稳定观察。
 */
function handleSlowDownload(): Response {
  const chunk = new Uint8Array(1024 * 1024)
  const totalChunks = 20
  let sent = 0
  const stream = new ReadableStream({
    async pull(controller) {
      if (sent >= totalChunks) {
        controller.close()
        return
      }
      sent++
      controller.enqueue(chunk)
      await new Promise(resolve => setTimeout(resolve, 100))
    },
  })
  return new Response(stream, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': 'attachment; filename="lab-slow-download.bin"',
      // 必须显式声明总长：缺省时 totalBytes=0 为不确定态，平台下载卡不渲染进度条
      'content-length': String(totalChunks * chunk.byteLength),
    },
  })
}

/**
 * 目录模式：appId → 目录，pathname → 文件。
 * '/' 回落 index.html；解码 URL 转义；resolve 后必须落在目录内（杜绝路径穿越）；
 * 扩展名必须在 MIME 表内（未知类型拒绝），每次请求实时读盘（改完刷新即生效）。
 */
async function handleDirAppRequest(host: string, pathname: string): Promise<Response> {
  const dir = appDirs[host]
  const relative = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html'
  const file = resolve(dir, relative)
  if (!file.startsWith(dir + sep)) { return new Response(`forbidden path: ${host}/${relative}`, { status: 403 }) }
  const mime = assetMimeTypes[extname(file).toLowerCase()]
  if (!mime) { return new Response(`unsupported asset: ${host}/${relative}`, { status: 404 }) }
  try {
    const data = await readFile(file)
    return new Response(data, { headers: { 'content-type': mime } })
  }
  catch {
    return new Response(`asset not found: ${host}/${relative}`, { status: 404 })
  }
}

/** 内部页请求路由：纯目录模式，源码即产物，实时读盘改完刷新即生效（lab 的 slow-download 特殊路由除外） */
async function handleAppRequest(request: Request): Promise<Response> {
  const { host, pathname } = new URL(request.url)
  if (host === 'lab' && pathname === '/slow-download') {
    return handleSlowDownload()
  }
  if (host in appDirs) {
    return handleDirAppRequest(host, pathname)
  }
  return new Response(`unknown internal app: ${host}`, { status: 404 })
}

/**
 * 第一阶段代码注册的测试 App（PRD #38）。
 * lab / devices 为本地静态测试页，用于验证 AppRegistry / AppInstance / Tab /
 * WebContents / Session / Permission / 导航策略与平台设备域通道；fsy 为第三方远程源对照。
 */
const builtinApps: DesktopAppManifest[] = [
  {
    id: 'test',
    name: '测试',
    version: '1.0.0',
    type: 'internal',
    entry: { type: 'web', url: 'http://localhost:8080/' },
    permissions: ['storage'],
  },
  {
    id: 'fsy',
    name: 'FSY',
    version: '1.0.0',
    type: 'internal',
    entry: { type: 'web', url: 'https://gmuat.fsygroup.com/' },
    permissions: ['storage'],
    // 套壳模式：激活时隐藏外壳、Web 铺满窗口（顶栏保留固定 Tab 条与窗口控制，Tab 不可关闭）
    chrome: 'single',
  },
  {
    // 平台功能实验室：声明全部权限，与 FSY（仅 storage）对照——
    // 应用中心里对比「已声明」与「按需询问」，lab 页面逐项点出放行/拦截效果
    id: 'lab',
    name: '平台实验室',
    version: '1.0.0',
    type: 'internal',
    entry: { type: 'web', url: appEntryUrl('lab') },
    permissions: [
      'storage',
      'clipboard.read',
      'clipboard.write',
      'notification',
      'network',
      'download',
      'upload',
      'filesystem.read',
      'filesystem.write',
      'window',
      'fullscreen',
    ],
  },
  {
    // 设备测试：外设通道测试页（打印 / 采集 / 扫码），自包含静态页逐项验证平台设备域通道
    id: 'devices',
    name: '设备测试',
    version: '1.0.0',
    type: 'internal',
    entry: { type: 'web', url: appEntryUrl('devices') },
    permissions: ['storage', 'filesystem.write', 'media'],
  },
]

bootstrap({
  // 运行时身份与打包身份同源于 electron/identity.cjs（electron-builder.cjs 同样引用）
  app: {
    id: appId,
    name: productName,
    version: '1.0.0',
  },
  window: {
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
  },
  // 飞书式沉浸顶栏：隐藏系统标题栏（自绘窗口控制是唯一入口），backgroundColor 防启动闪白
  browserWindowOptions: { autoHideMenuBar: true, titleBarStyle: 'hidden', backgroundColor: '#f6f7f9' },
  // 系统托盘：关窗最小化到托盘，托盘菜单退出才真退
  features: { tray: true },
  // 内部页标准源协议：处理器挂到每个 App 的 persist 分区 Session 上（core 统一注册）
  protocols: { app: handleAppRequest },
  apps: {
    allowThirdParty: false,
    manifests: builtinApps,
    // 远程源联调开关：DESKTOP_APPS_REMOTE 指向返回 DesktopAppManifest 数组的 URL，
    // DESKTOP_APPS_ORIGINS 为其 origin 白名单（逗号分隔，生产部署改成应用中心地址与域名）
    ...(process.env.DESKTOP_APPS_REMOTE
      ? {
          remoteUrl: process.env.DESKTOP_APPS_REMOTE,
          remoteOrigins: process.env.DESKTOP_APPS_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) ?? [],
        }
      : {}),
  },
  // 更新体系联调开关：设置 DESKTOP_UPDATE_FEED 环境变量后启用（生产部署改成真实更新服务器地址）
  updates: process.env.DESKTOP_UPDATE_FEED
    ? { url: process.env.DESKTOP_UPDATE_FEED, asar: 'asar-manifest.json' }
    : undefined,
  icon,
})
