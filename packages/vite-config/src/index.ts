import type { UserConfig } from 'vite'
import { resolve } from 'node:path'
import process from 'node:process'
import { defineConfig } from 'electron-vite'

export interface CreateElectronViteConfigOptions {
  /** renderer 额外配置（插件、alias 等），与默认配置浅合并 */
  renderer?: UserConfig
  /** main 进程入口，相对 app 目录 */
  mainEntry?: string
  /** preload 入口，相对 app 目录 */
  preloadEntry?: string
}

/**
 * 创建 electron-vite 配置。
 * electron-vite 从 app 目录运行，路径统一基于 process.cwd() 解析。
 */
export function createElectronViteConfig(options: CreateElectronViteConfigOptions = {}) {
  const {
    renderer,
    mainEntry = 'electron/main/index.ts',
    preloadEntry = 'electron/preload/index.ts',
  } = options
  const cwd = process.cwd()

  return defineConfig({
    main: {
      build: {
        rollupOptions: {
          input: { index: resolve(cwd, mainEntry) },
          // Electron 内置模块不在 electron-vite 默认 external 列表里，显式声明
          // （运行时由 Electron 提供，删真实 .asar 文件必须用它绕过 asar fs 补丁）
          external: ['original-fs'],
        },
      },
    },
    preload: {
      build: {
        rollupOptions: {
          input: { index: resolve(cwd, preloadEntry) },
          // 强制 CJS：ESM preload 要求 sandbox: false，这里保持 sandbox: true 的安全默认。
          // 文件名显式固定，不受 app package.json type 影响
          output: {
            format: 'cjs',
            entryFileNames: '[name].cjs',
            chunkFileNames: '[name]-[hash].cjs',
          },
        },
      },
    },
    renderer: {
      root: '.',
      build: {
        rollupOptions: {
          input: { index: resolve(cwd, 'index.html') },
        },
      },
      ...renderer,
    },
  })
}
