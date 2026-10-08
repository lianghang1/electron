import process from 'node:process'
import { bootstrap } from '@desktop/core'
import { is } from '@electron-toolkit/utils'
import icon from '../resources/icon.png?asset'

/**
 * 殡仪服务自助机：单应用全屏形态（Kiosk 同构骨架）。
 * 自有受信业务，session 权限走 'all'（逃生口语义，直接 Chromium 名）；
 * 进程级安全基线（sandbox / contextIsolation / 导航防护）仍由 core 写死生效。
 */
bootstrap({
  app: {
    id: 'com.company.funeral-kiosk',
    name: 'FuneralKiosk',
    version: '1.0.0',
  },
  window: {
    title: '殡仪服务自助机',
    // dev 用小窗口便于调试；生产铺满全屏由 kiosk 接管（尺寸仅作窗口创建参数）
    ...(is.dev ? { width: 1280, height: 800 } : { width: 1920, height: 1080 }),
  },
  apps: {
    allowThirdParty: false,
  },
  // 更新体系开关：DESKTOP_UPDATE_FEED 指向更新服务器（整包 latest.yml + asar 清单同源），
  // 生产部署写进部署环境；未配置则两种更新都禁用
  updates: process.env.DESKTOP_UPDATE_FEED
    ? { url: process.env.DESKTOP_UPDATE_FEED, asar: 'asar-manifest.json' }
    : undefined,
  // 单应用形态：不装配 Tab 体系（Tab/App/Web 服务不实例化，tabs:* 通道不注册）
  features: {
    tabs: false,
  },
  // 无人值守韧性仅生产生效（dev 关掉，否则 exitGuard 拦窗口关闭会打断调试循环）：
  // 崩溃自恢复 + 开机自启 + 防退出 + 每日 3:00 定时重启（应用更新/释放内存）
  ...(is.dev
    ? {}
    : {
        resilience: {
          crashReload: true,
          autoLaunch: true,
          exitGuard: true,
          scheduledRestart: {},
        },
      }),
  icon,
  browserWindowOptions: {
    // dev：可拖动普通窗口；生产：kiosk 系统级锁死全屏（隐含 fullscreen，防 Alt+Tab 逃逸）
    ...(is.dev ? { frame: true } : { kiosk: true, frame: false }),
    backgroundColor: '#10131a', // 与 renderer 底色一致，避免全屏启动闪白
  },
  permissions: 'all',
})
