import process from 'node:process'
import { bootstrap } from '@desktop/core'
import { is } from '@electron-toolkit/utils'
// 图标放 build/：resources 是主进程默认 publicDir，其内 ?asset 不复制文件进 out，打包后在 asar 内失效
import icon from '../../build/icon.png?asset'
import { appId, displayName, productName } from '../identity.cjs'

/**
 * 单应用全屏形态（Kiosk 同构骨架）。
 * 自有受信业务，session 权限走 'all'（逃生口语义，直接 Chromium 名）；
 * 进程级安全基线（sandbox / contextIsolation / 导航防护）仍由 core 写死生效。
 */
bootstrap({
  // 运行时身份（setAppUserModelId / 单实例锁 / app:// 协议源），dev 模式必需；
  // 运行时身份与打包身份同源于 electron/identity.cjs（electron-builder.cjs 同样引用）
  app: {
    id: appId,
    name: productName,
    version: '1.0.0',
  },
  window: {
    title: displayName,
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
    autoHideMenuBar: true,
    ...(is.dev
      ? {
          kiosk: false,
        }
      : {
          kiosk: true,
        }
    ),
  },
  permissions: 'all',
})

// 业务 IPC 通道在此注册：参照 apps/funeral-kiosk/electron/main/ipc 的域通道表模式，
// 并在 electron/preload/index.ts 的 exposeDesktop 传入对应白名单
