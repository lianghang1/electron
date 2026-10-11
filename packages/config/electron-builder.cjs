/**
 * electron-builder 配置工厂（全 app 共享）：asar 热更架构的全部硬性契约集中在此，
 * 各 app 只通过 overrides 声明平台差异（安装器形态/图标/品牌位图），不得覆盖
 * files / afterPack / extraResources / publish 结构。
 *
 * 架构契约（完整说明见 packages/core/scripts/after-pack.cjs 头注释）：
 * 1. app.core.asar 必须纯 JS：asarUnpack 永不配置，原生依赖（koffi 等）走 afterPack 的 asar 外分发
 * 2. bundle 自包含（vite 工厂 externalizeDeps:false），node_modules 整体排除出 asar
 * 3. 热更只换代码：resources/（厂商 DLL、SumatraPDF、内置页面）变化必须走整包更新
 */

/** 递归合并：对象深合并，数组与原始值以 override 为准 */
function deepMerge(base, override) {
  const result = { ...base }
  for (const key of Object.keys(override)) {
    const baseValue = base[key]
    const overrideValue = override[key]
    if (Array.isArray(overrideValue) || typeof overrideValue !== 'object' || overrideValue === null
      || typeof baseValue !== 'object' || baseValue === null || Array.isArray(baseValue)) {
      result[key] = overrideValue
    }
    else {
      result[key] = deepMerge(baseValue, overrideValue)
    }
  }
  return result
}

/**
 * @param {object} options
 * @param {string} options.appId 打包身份（identity.cjs 唯一真源）
 * @param {string} options.productName 英文产品名：exe/安装目录/安装包名前缀（必须 ASCII）
 * @param {string} [options.executableName] Linux 可执行文件名（name 带 @app/ 前缀时必须显式指定）
 * @param {string} options.publishUrl 更新 feed 基地址（运行时可被 DESKTOP_UPDATE_FEED 覆盖，此处为占位）
 * @param {object} [options.overrides] 平台差异：win/nsis/mac/linux 深合并进公共基线
 */
exports.createElectronBuilderConfig = function createElectronBuilderConfig(options) {
  const { appId, productName, executableName = productName, publishUrl, overrides = {} } = options
  return deepMerge({
    appId,
    productName,
    executableName,
    directories: {
      buildResources: 'build',
    },
    afterPack: 'scripts/after-pack.cjs',
    files: [
      '!**/.vscode/*',
      '!src/*',
      '!scripts/*',
      '!electron/**',
      '!shared/**',
      // bundle 自包含（vite 工厂 externalizeDeps:false），node_modules 整体不进 asar：
      // 热更包体积的前提，也规避依赖收集器在 pnpm 下的不确定行为
      '!node_modules/**',
      '!electron.vite.config.{js,ts,mjs,cjs}',
      '!electron-builder.cjs',
      '!{.eslintcache,eslint.config.mjs,tsconfig.json,tsconfig.node.json,tsconfig.web.json,contracts.d.ts}',
      '!{.env,.env.*,.npmrc,pnpm-lock.yaml}',
      // electron-builder 只自动排除"当前"输出目录；输出目录改名/迁移时旧产物会被打进 asar
      '!dist/**',
      '!dist-*/**',
      // resources 走 extraResources（asar 外真实文件），不进 asar；icon 已由 ?asset 构建进 out/
      '!resources/**',
    ],
    extraResources: [
      {
        from: 'resources',
        to: 'resources',
      },
    ],
    publish: {
      provider: 'generic',
      url: publishUrl,
    },
    win: {
      // Windows 交付均为 x64；如需 Windows on ARM 在 overrides 里追加 arch
      target: [
        {
          target: 'nsis',
          arch: ['x64'],
        },
      ],
      icon: 'build/icon.ico',
    },
    npmRebuild: false,
    electronDownload: {
      mirror: 'https://npmmirror.com/mirrors/electron/',
    },
  }, overrides)
}
