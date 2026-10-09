import type { ElectronViteConfigFnPromise } from 'electron-vite'
import type { UserConfig } from 'vite'
import { resolve } from 'node:path'
import process from 'node:process'

/**
 * renderer 回调可用的环境信息：vite ConfigEnv 的结构子集。
 * 用结构类型而非直接引用 ConfigEnv——pnpm 下本包与 electron-vite 可能解析到不同 vite 实例，
 * 直接引用会因类型不同一导致 defineConfig 函数重载全部失配。
 */
export interface RendererConfigEnv {
  /** 构建命令：serve = dev，build = 打包 */
  command: 'build' | 'serve'
  /** 当前 mode（development / production / 自定义 --mode） */
  mode: string
}

export interface CreateElectronViteConfigOptions {
  /**
   * renderer 额外配置（插件、alias 等），与默认配置浅合并。
   * 支持函数形态：可读取 mode / command，配合 loadEnv 按环境定制（如 dev 专属插件）。
   */
  renderer?: UserConfig | ((env: RendererConfigEnv) => UserConfig | Promise<UserConfig>)
  /** main 进程入口，相对 app 目录 */
  mainEntry?: string
  /** preload 入口，相对 app 目录 */
  preloadEntry?: string
}

/**
 * 创建 electron-vite 配置。
 * electron-vite 从 app 目录运行，路径统一基于 process.cwd() 解析。
 * 返回 async 函数形态配置（electron.vite.config.ts 可直接 default export），env 由 electron-vite 注入，
 * 函数与对象形态的 renderer 均按环境求值。
 */
export function createElectronViteConfig(options: CreateElectronViteConfigOptions = {}): ElectronViteConfigFnPromise {
  const {
    renderer,
    mainEntry = 'electron/main/index.ts',
    preloadEntry = 'electron/preload/index.ts',
  } = options
  const cwd = process.cwd()

  return async (env) => {
    const extra = typeof renderer === 'function' ? await renderer(env) : renderer
    return {
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
        ...extra,
      },
    }
  }
}
