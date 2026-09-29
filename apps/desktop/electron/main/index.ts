import type { DesktopAppManifest } from '@desktop/shared'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { bootstrap } from '@desktop/core'
import { protocol } from 'electron'
import crmUrl from '../resources/apps/crm.html?asset'
import labUrl from '../resources/apps/lab.html?asset'
import oaUrl from '../resources/apps/oa.html?asset'
import icon from '../resources/icon.png?asset'

// 内部 App 页面协议：app://<appId>/index.html。
// standard + secure 使其成为标准安全源——cookie / origin 语义等同 https（file:// 源禁止写 cookie），
// 且 web-service 的 origin 守卫（弹窗受管 / 导航拦截）按 origin 比对自动兼容。
// registerSchemesAsPrivileged 必须在 app ready 前调用（模块顶层）；
// 处理器经 bootstrap.protocols 注入，由 core 挂到每个 App 的 persist 分区 Session 上。
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

/** appId → 内部页磁盘文件（?asset 产出的磁盘绝对路径），协议处理器按 host 取文件 */
const appFiles: Record<string, string> = {
  crm: crmUrl,
  oa: oaUrl,
  lab: labUrl,
}

const appEntryUrl = (id: string): string => `app://${id}/index.html`

/** 忽略 pathname：内部页均为单文件应用，任意路径都回落到 entry 文件（杜绝路径穿越） */
async function handleAppRequest(request: Request): Promise<Response> {
  const { host } = new URL(request.url)
  const file = appFiles[host]
  if (!file)
    return new Response(`unknown internal app: ${host}`, { status: 404 })
  try {
    // ?asset 产出的就是磁盘绝对路径（join(import.meta.dirname, ...)），直接读
    const html = await readFile(file)
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  }
  catch (error) {
    // 读文件失败时把错误带回页面（status 500），避免只看到无信息的空白错误页
    return new Response(`internal app load failed: ${host}\n${String(error)}`, {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }
}

/**
 * 第一阶段代码注册的测试 App（PRD #38）。
 * 页面为本地静态测试页（各自独立配色 / 加载时间戳 / localStorage 计数），
 * 用于验证 AppRegistry / AppInstance / Tab / WebContents / Session / Permission / 导航策略。
 */
const builtinApps: DesktopAppManifest[] = [
  {
    id: 'crm',
    name: 'CRM',
    version: '1.0.0',
    type: 'internal',
    entry: { type: 'web', url: appEntryUrl('crm') },
    permissions: ['storage', 'clipboard.read', 'download'],
  },
  {
    id: 'oa',
    name: 'OA',
    version: '1.0.0',
    type: 'internal',
    entry: { type: 'web', url: appEntryUrl('oa') },
    permissions: ['storage'],
  },
  {
    id: 'fsy',
    name: 'FSY',
    version: '1.0.0',
    type: 'internal',
    entry: { type: 'web', url: 'https://gmuat.fsygroup.com/' },
    permissions: ['storage'],
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
    ],
  },
]

bootstrap({
  app: {
    id: 'com.company.desktop',
    name: 'Desktop',
    version: '1.0.0',
  },
  window: {
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
  },
  // 飞书式沉浸顶栏：隐藏系统标题栏（自绘窗口控制是唯一入口），backgroundColor 防启动闪白
  browserWindowOptions: { titleBarStyle: 'hidden', backgroundColor: '#f6f7f9' },
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
