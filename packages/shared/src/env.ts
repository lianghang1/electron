import process from 'node:process'

/**
 * dev 态判定：electron-vite dev 给主进程注入 renderer dev server 地址（打包态无此 env）。
 * 全仓唯一判定源。禁止用 app.isPackaged——本机 electron.exe 经 default_app 引导加载
 * 目录 app 时 process.defaultApp=true，isPackaged 恒为 true（CJS/ESM、相对/绝对路径皆然）。
 */
export function isDevLoad(): boolean {
  return process.env.ELECTRON_RENDERER_URL !== undefined
}
