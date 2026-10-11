修复 electron-builder 打包体系问题（按优先级，每步独立可验证）：

1. **koffi asar 外分发（P1）**
   - koffi 整包拷入 `<resourcesPath>/node_modules/koffi`（在共享 afterPack 钩子中从 pnpm store 解析真实路径拷贝，或 extraResources），不加进 app dependencies、不配置 asarUnpack。
   - 验证：require 从 app.core.asar 向上逃逸到 resources/node_modules 命中；identity 驱动在打包版可 LoadLibrary。
   - 同步复核 `npmRebuild: false` 与 postinstall install-app-deps 的组合仍自洽。

2. **ajv 外部 require 收敛（P2）**
   - 让 ajv/ajv-formats 的 5 处 codegen require 可解析：优先 electron-vite 构建期 resolve（alias/optimizeDeps），否则将 ajv、ajv-formats 提升为 app dependencies。
   - 建立不变量：out/main 零外部 require（写进 config 注释）。

3. **kiosk asar 瘦身（P1）**
   - 先最小构建复现 collector 收入 typescript/.pnpm/构建工具链的行为并定位原因（electron-builder 26 + pnpm + shamefully-hoist），再决定：files 显式排除（`!node_modules/**` 等）或调整依赖声明；排除前提是第 2 步已完成（bundle 零外部 require）。
   - 验收：app.core.asar 回到 ~80MB 量级（out 15MB + 生产依赖闭包 ~60MB）。

4. **publish 配置补齐（P2）**：两个 electron-builder.cjs 增加 `publish: { provider: 'generic', url: <更新服务器占位> }`，生成 app-update.yml；确认 update-service 的 setFeedURL 覆盖逻辑不受影响。

5. **架构约束注释化（P2）**：在共享 afterPack 钩子与两个 electron-builder.cjs 注释中写明"app.core.asar 禁止包含需要解包的内容、asarUnpack 必须保持未配置"的硬约束；更新钩子过期头注释（yml/../../ → 薄壳 require 方案）。

6. **files 白名单对齐（P3）**：desktop 补 `!scripts/*`；两端统一 contracts.d.ts 排除；两端补 `!electron/**`、`!shared/**`（主进程源码不进 asar）；generate-app.ts 模板补 `!resources/**` 并同步以上约定。

7. **desktop 平台项补齐（P3）**：补 `executableName`、显式三平台 icon、显式 win arch x64；与用户确认 nsis oneClick:false 差异是否有意。

8. **杂项（P3）**：pack-hotfix productName 展示修正（读 identity.cjs 或补 package.json productName）；确认 resources/brand 位图接线（desktop installerSidebar / kiosk installerHeader）或删除生成器；清理 desktop dist 的 app_core 残留。

每步完成后运行 typecheck + 构建，最终以 win-unpacked 启动冒烟 + launcher.log 作为整体验收。