# electron-monorepo

pnpm monorepo，当前包含两个 Electron 应用与共享基础设施：

- `apps/desktop`（@app/desktop）—— 平台 Shell（Tab 体系、内置应用、设备接入）
- `apps/funeral-kiosk`（@app/funeral-kiosk）—— 殡仪自助一体机（全屏单应用）
- `packages/core` —— 共享主进程库（bootstrap、设备接入、更新体系、launcher 引导器）
- `packages/config` —— 共享构建配置工厂（vite / eslint / tsconfig / electron-builder）
- `packages/shared`、`packages/utils` —— 共享类型与工具

## 常用命令

```bash
pnpm dev                     # desktop 开发模式
pnpm build:win               # desktop 打包（Windows）
pnpm --filter @app/funeral-kiosk build:win   # kiosk 打包
pnpm typecheck               # 全仓类型检查
pnpm lint                    # ESLint
pnpm test                    # core 单元测试

pnpm hotfix <app>            # 热更发布（详见 docs/release.md）
pnpm sync:resources          # 重建设备资源 junction（postinstall 自动执行，一般无需手动）
pnpm exec tsx scripts/e2e-packaged.ts <app> [--hot]   # 打包产物自动冒烟（树外裸环境）
pnpm gen:app <slug> <中文名>  # 脚手架生成新应用（详见 docs/app-scaffold.md）
```

## 架构要点：asar 双层热更

打包产物为「KB 级引导器 `app.asar` + 可整体替换的代码包 `app.core.asar`」：
引导器永不更新，启动早期按 `userData/desktop-updater/` 的指针加载内置包或热更包，
加载失败自动回退、首启 60s 未存活自动回滚（防变砖）。

三条硬性契约（完整说明见 `packages/core/scripts/after-pack.cjs` 头注释）：

1. **app.core.asar 纯 JS**：`asarUnpack` 永不配置，原生依赖（koffi 等）由 afterPack 分发到 asar 外
2. **bundle 自包含**：vite 工厂 `externalizeDeps: false`，node_modules 整体排除出 asar
3. **热更只换代码**：resources/（厂商 DLL、SumatraPDF、内置页面）变化必须走整包更新

配置公共部分集中在 `@desktop/config/electron-builder` 工厂与 `@desktop/config/vite` 工厂，
应用侧只声明差异；新增应用用 `pnpm gen:app` 脚手架，自动继承全部契约。

**设备资源单一来源**：厂商 DLL / 打印组件等硬件文件在仓库根 `resources/devices/`（与
`packages/core` 驱动代码同仓演进），各应用 `resources/devices` 是 postinstall 建立的
junction——更新驱动文件只改一处，所有应用开发与打包自动生效。

## 文档

- [`docs/update-server.md`](docs/update-server.md) —— 更新服务器对接要求（feed 目录、清单协议、版本纪律）
- [`docs/release.md`](docs/release.md) —— 发布手册（热更 / 整包 checklist、回滚、事故速查）
- [`docs/deploy.md`](docs/deploy.md) —— 部署手册（环境变量、安装形态、目录速查、排查入口）
- [`docs/app-scaffold.md`](docs/app-scaffold.md) —— 脚手架与模板扩展指南

## 更新与发布

- 客户端两通道共用 feed 基地址（部署环境变量 `DESKTOP_UPDATE_FEED`）：asar 热更 + electron-updater 整包
- 服务器对接要求、清单协议、发布/回滚纪律见 **`docs/update-server.md`**
- 本地验证打包产物：`pnpm exec tsx scripts/e2e-packaged.ts desktop --hot`（含热更闭环，需先 `pnpm hotfix desktop`）
