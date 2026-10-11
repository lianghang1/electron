import type { ElectronViteConfigFnPromise } from 'electron-vite'
import type { UserConfig } from 'vite'
import { resolve } from 'node:path'
import process from 'node:process'
import { mergeConfig } from 'vite'

/**
 * 配置回调可用的环境信息：vite ConfigEnv 的结构子集。
 * 用结构类型而非直接引用 vite ConfigEnv——pnpm 下本包与 electron-vite 可能解析到不同 vite 实例，
 * 直接引用会因类型不同一导致 defineConfig 函数重载全部失配。
 */
export interface CreateConfigEnv {
  /** 构建命令：serve = dev，build = 打包 */
  command: 'build' | 'serve'
  /** 当前 mode（development / production / 自定义 --mode） */
  mode: string
}

/** 进程段配置输入：对象，或按环境求值的回调（可读取 mode / command，配合 loadEnv 按环境定制） */
export type ConfigInput = UserConfig | ((env: CreateConfigEnv) => UserConfig | Promise<UserConfig>)

export interface CreateElectronViteConfigOptions {
  /** main 进程额外配置，与默认配置深合并（vite mergeConfig：对象深合并、数组拼接） */
  main?: ConfigInput
  /** preload 额外配置，与默认配置深合并 */
  preload?: ConfigInput
  /** renderer 额外配置，与默认配置深合并 */
  renderer?: ConfigInput
  /** main 进程入口，相对 app 目录 */
  mainEntry?: string
  /** preload 入口，相对 app 目录 */
  preloadEntry?: string
}

/** 求值配置输入：回调形态传入环境求值，对象形态原样返回 */
async function evalConfigInput(input: ConfigInput | undefined, env: CreateConfigEnv): Promise<UserConfig | undefined> {
  if (!input) {
    return undefined
  }
  return typeof input === 'function' ? input(env) : input
}

/** 额外配置与默认配置合并；无额外配置时直接复用默认对象 */
function mergeExtra(defaults: UserConfig, extra: UserConfig | undefined): UserConfig {
  return extra ? mergeConfig(defaults, extra) : defaults
}

/**
 * 创建 electron-vite 配置。
 * electron-vite 从 app 目录运行，路径统一基于 process.cwd() 解析。
 * main / preload / renderer 三段均支持对象或函数形态的额外配置，与内置默认深合并。
 *
 * 直接返回显式标注类型的 async 函数——不经过 defineConfig 包裹：
 * pnpm 双 vite 实例下 ConfigEnv 类型不同一，defineConfig 的函数重载会全部失配。
 */
export function createElectronViteConfig(options: CreateElectronViteConfigOptions = {}): ElectronViteConfigFnPromise {
  const {
    main,
    preload,
    renderer,
    mainEntry = 'electron/main/index.ts',
    preloadEntry = 'electron/preload/index.ts',
  } = options
  const cwd = process.cwd()

  const mainDefaults: UserConfig = {
    build: {
      rollupOptions: {
        input: { index: resolve(cwd, mainEntry) },
        // Electron 内置模块不在 electron-vite 默认 external 列表里，显式声明
        // （运行时由 Electron 提供，删真实 .asar 文件必须用它绕过 asar fs 补丁）
        external: ['original-fs'],
        // 强制 CJS（.cjs 后缀）：与 preload 一致，asar 内 package.json 的 type:module
        // 不再影响主进程 bundle 的模块判定（ESM 输出在 asar 热更场景存在解析差异）
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
          chunkFileNames: '[name]-[hash].cjs',
        },
      },
    },
  }

  const preloadDefaults: UserConfig = {
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
  }

  // electron-vite 对 vite build 的扩展键 build.externalizeDeps（默认 true：把 package.json
  // dependencies 外部化为裸导入）。裸导入在打包后依赖 asar 内 node_modules 解析——与 asar
  // 热更架构（asar 纯 JS、node_modules 整体排除）冲突，且开发机上会因目录树恰好存在
  // node_modules 侥幸通过。关闭后主进程/preload bundle 完全自包含（asar 热更架构契约 2）。
  // 该键 vite 类型未收录、双 vite 实例下不宜引入其类型，经定向断言写入
  ;(mainDefaults.build as { externalizeDeps?: boolean }).externalizeDeps = false
  ;(preloadDefaults.build as { externalizeDeps?: boolean }).externalizeDeps = false

  const rendererDefaults: UserConfig = {
    root: '.',
    build: {
      rollupOptions: {
        input: { index: resolve(cwd, 'index.html') },
      },
    },
  }

  return async (env) => {
    const [mainExtra, preloadExtra, rendererExtra] = await Promise.all([
      evalConfigInput(main, env),
      evalConfigInput(preload, env),
      evalConfigInput(renderer, env),
    ])

    return {
      main: mergeExtra(mainDefaults, mainExtra),
      preload: mergeExtra(preloadDefaults, preloadExtra),
      renderer: mergeExtra(rendererDefaults, rendererExtra),
    }
  }
}
