import process from 'node:process'
import { bootstrap } from '@desktop/core'
import { app } from 'electron'
// 图标必须放 build/（不命中 electron-vite 主进程默认 publicDir=resources）：publicDir 内的
// ?asset 不复制文件进 out，仅生成相对 out 的路径——dev 恰好命中，打包后在 asar 内失效致托盘无图标
import icon from '../../build/icon.png?asset'
import { appId, productName } from '../identity.cjs'

// 仅 Windows：全屏浮层（拍摄/授权弹窗/右键菜单）盖住主窗时，Chromium 原生遮挡计算
// 会把主窗判为完全遮挡而暂停渲染合成——浮层下页面逻辑照跑但画面不更新，结果/提示
// 拖到浮层关闭后才上屏。禁用该特性保持主窗持续合成（mac/Linux 无此遮挡机制，不动）
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
}

/**
 * 内部静态 App（app:// 标准源协议）如需使用，参照 apps/desktop/electron/main/index.ts：
 * 模块顶层 registerSchemesAsPrivileged（必须在 app ready 前）+ bootstrap.protocols 注入处理器。
 */

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
  // 飞书式沉浸顶栏：隐藏系统标题栏（Shell 自绘窗口控制是唯一入口），backgroundColor 防启动闪白
  browserWindowOptions: { autoHideMenuBar: true, titleBarStyle: 'hidden', backgroundColor: '#f6f7f9' },
  // 系统托盘：按需开启（关窗最小化到托盘，托盘菜单退出才真退）
  // features: { tray: true },
  apps: {
    allowThirdParty: false,
    // 内置 App 清单（Desktop 形态的业务入口，打开即 Tab 页），写法参照 apps/desktop 的 builtinApps
    manifests: [],
  },
  // 更新体系联调开关：设置 DESKTOP_UPDATE_FEED 环境变量后启用（生产部署改成真实更新服务器地址）
  updates: process.env.DESKTOP_UPDATE_FEED
    ? { url: process.env.DESKTOP_UPDATE_FEED, asar: 'asar-manifest.json' }
    : undefined,
  icon,
})
