import process from 'node:process'
import { bootstrap } from '@desktop/core'
import { app } from 'electron'
import { loadBusinessConfig } from './config'
import { registerFhBusiness } from './peripherals/business'

// userData 路径锁定：productName 为中文（影响安装界面/快捷方式），若跟随默认，
// userData 会落在「Roaming\智慧殡仪自助终端」中文目录，运维脚本/日志采集易踩编码坑。
// 显式固定为 FhKiosk（ASCII），必须在 bootstrap 创建窗口前调用。
app.setName('FhKiosk')

/**
 * 殡仪馆自助服务终端：Kiosk 形态（单应用全屏，无 Tab Shell）。
 * 自有受信业务，session 权限 'all'；进程级安全基线由 core 写死生效。
 * 韧性三项全开：大厅无人值守场景，崩溃自恢复 + 开机自启 + 防误关机。
 * 设备通道（读卡器/打印机）由平台通用层提供（内置 mock），业务通道见 peripherals/business.ts。
 */

// ---- 大屏等比缩放：以 1920×1080 设计稿为基准 ----
// 全屏大机（2K/4K）时通过 Chromium zoomFactor 等比放大全站内容（文字/图标/键盘随布局一起变大，
// 真实重排不发虚）；getContentSize 为 DIP 逻辑分辨率，Windows DPI 缩放自动正确。
// 小于设计稿的屏幕不缩小（factor 下限 1）。窗口在 bootstrap 的 whenReady 回调里创建，
// main 同步拿不到，故挂全局 browser-window-created（构造完成后发出、直接给窗口实例；
// renderer crash 重载复用 webContents，zoomFactor 保留无需重设）。
// 注意：不能用 web-contents-created + BrowserWindow.fromWebContents——该事件在 BrowserWindow
// 构造过程中同步发出，此时 owner window 未设置完成，fromWebContents 返回 null。
const DESIGN_WIDTH = 1920
const DESIGN_HEIGHT = 1080

app.on('browser-window-created', (_event, win) => {
  const contents = win.webContents

  const applyZoom = (): void => {
    const [w, h] = win.getContentSize()
    // dev 调试：FH_ZOOM_FORCE=1.5 强制指定缩放倍率，任意屏幕预览大屏效果
    const forced = Number.parseFloat(process.env.FH_ZOOM_FORCE || '')
    const factor = Number.isFinite(forced)
      ? forced
      : Math.max(Math.min(w / DESIGN_WIDTH, h / DESIGN_HEIGHT), 1)
    contents.setZoomFactor(factor)
  }

  applyZoom()
  let timer: NodeJS.Timeout | null = null
  const schedule = (): void => {
    if (timer)
      clearTimeout(timer)
    timer = setTimeout(applyZoom, 120)
  }
  win.on('resize', schedule)
  win.on('enter-full-screen', schedule)
})

bootstrap({
  app: {
    id: 'com.company.funeral',
    name: 'FhKiosk',
    version: '1.0.0',
  },
  window: {
    title: '殡仪馆自助服务终端',
    width: 1920,
    height: 1080,
  },
  apps: {
    allowThirdParty: false,
  },
  // 单应用形态：不装配 Tab 体系
  features: {
    tabs: false,
  },
  resilience: {
    crashReload: true,
    autoLaunch: true,
    exitGuard: true,
  },
  browserWindowOptions: {
    fullscreen: true,
    kiosk: true,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#f7f6f3', // 与 renderer 底色一致，避免全屏启动闪白
  },
  permissions: 'all',
})

// ---- 殡仪馆业务通道（app 本地契约 fh:*，handler 在 app 侧注册） ----
registerFhBusiness(loadBusinessConfig())
