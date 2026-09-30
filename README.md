# Desktop Platform

类飞书桌面平台的 Electron monorepo：一个 Shell（窗口框架 + 标签页容器）承载多个 Web App，平台提供统一的安全基线、IPC 契约、会话与存储隔离。

## 文档导航

- [docs/app-integration.md](./docs/app-integration.md) — **App 接入指南**：Web App / Kiosk 接入、权限模型、契约三步、发布流程（新人/接入方从这里开始）
- [docs/ROADMAP.md](./docs/ROADMAP.md) — 进度唯一事实源 + 关键决策记录（勿回退项）
- [prd.md](./prd.md) — 需求与架构背景

## 技术栈

- Electron + electron-vite（ESM main，CJS preload）
- pnpm workspace + catalog 依赖管理
- TypeScript（严格模式，契约驱动）
- Vue 3（Shell UI）
- antfu eslint 配置（同时作为唯一 formatter，无 Prettier）

## 项目结构

```
electron/
├── apps/
│   ├── desktop/              # 形态一：Tab Shell（多应用承载，类飞书）
│   │   ├── electron/main/    # bootstrap：注册 App、窗口配置
│   │   ├── electron/preload/ # 薄壳：re-export core preload
│   │   └── src/              # Shell renderer：TabBar / AppLauncher / 窗口控制
│   ├── kiosk|hospital|funeral/ # 形态二：自助机（单应用全屏，无 Tab Shell）
│   │   ├── electron/main/    # bootstrap：kiosk 窗口（fullscreen + kiosk: true）
│   │   └── src/              # 自有业务 UI，直接渲染
├── packages/
│   ├── shared/               # 跨端契约（纯类型 + 唯一运行时值 DesktopError）
│   │   └── src/types/ipc/    #   IPC 契约按能力域拆分，与 core/src/ipc/ 同名对应
│   ├── core/                 # 主进程平台运行时（不含任何业务）
│   │   └── src/
│   │       ├── runtime/      #   DesktopRuntime（组装根）+ bootstrap 入口
│   │       ├── ipc/          #   IPC 域注册文件（window/app/tabs/...）+ handle 原语
│   │       ├── app|window|tab|web|device|permission|storage|session|download|cache|overlay|updater|resilience|audit|logger/
│   │       │                 #   平台能力域（一域一目录，Service 构造器注入）
│   │       ├── event/        #   EventBus（域间解耦，仅 Main 进程内）
│   │       └── preload/      #   最小桥 window.desktop + 通道白名单
│   ├── config/               # 工程配置唯一入口：vite 工厂（dist）/ eslint 工厂 / tsconfig.base
│   └── utils/                # 环境无关工具层：HTTP 封装 / 加密 / 深度合并 / StorageManager / 验证（主进程可复用）
├── resources/brand/          # 安装器品牌图（NSIS sidebar/header）+ 生成脚本
├── scripts/                  # gen:app 脚手架 / hotfix 热更打包 / probe 回归探针
└── pnpm-workspace.yaml
```

## 核心架构

### 进程模型

```
Main (packages/core)
  ├── WindowService      主窗口（Shell）
  ├── WebService         WebContentsView 容器，runtimeId = tabId
  ├── TabService         Tab 状态机 → EventBus → 推送 Shell
  ├── AppService         App 实例生命周期
  ├── SessionService     partition 隔离：persist:app-<appId>
  ├── StorageService     electron-store：userData/app-<appId>.json
  └── PermissionService  按 App 声明授权，默认全拒

Preload (packages/core/preload)  沙箱 + contextIsolation，仅暴露 window.desktop

Renderer (Shell UI)             通过 window.desktop 调用平台，不接触 Electron API
Web App (WebContentsView)       不注入 preload，安全基线写死，与 Shell 进程隔离
```

### IPC 契约

全部 IPC 通道定义在 `packages/shared/src/types/ipc/`（按能力域拆分）并集为 `DesktopIpc`（type alias），双形态：

- `(...args) => result` — Renderer → Main 的 invoke
- `[...args]` — Main → Renderer 的推送事件（如 `tabs:updated`）

Main 侧 `handle()` 按 `DesktopInvoke` 子集约束通道与入参；preload 用 `satisfies` 校验 channel 名；Renderer 只通过 `window.desktop`（`DesktopApi`）访问平台。契约参数永不携带 appId / tabId，Main 通过 `CallerResolver`（webContents.id → CallerContext）反查调用者身份，防止伪造。

### 安全模型

- 进程级基线写死不可配置：`sandbox: true`、`contextIsolation: true`、`nodeIntegration: false` 等（因此 preload 必须为 CJS）
- 导航到外部 URL 一律交给系统浏览器；`window.open` / `target="_blank"` 拒绝创建新窗口
- 权限请求默认拒绝，仅放行 App bootstrap 中显式声明的权限
- Shell 专属通道（`tabs:setWorkArea`）校验调用者为 `desktop` 平台自身

### 数据流

Tab 状态变化由事件驱动：`TabService → EventBus → forwardEventsToShell → tabs:updated（全量列表）`，Shell UI 不做 diff，直接重渲染。

### 浮层（overlay）

全局 toast、运行时授权弹窗、Tab 右键菜单由**独立透明原生窗**（`core/src/window/overlay-window.ts`）承载，分 panel / dialog / menu 三类：WebContentsView 原生层永远压过 Shell DOM，DOM 浮层会被 Web 内容遮住，原生浮层窗则天然压过 Web 内容且完全不扰动页面布局。

## 快速开始

```bash
pnpm install        # 安装依赖
pnpm dev            # 启动桌面应用（dev 模式，HMR）
pnpm dev:kiosk      # 启动自助机应用（全屏 kiosk 形态）
pnpm dev:hospital   # 医院自助终端
pnpm dev:funeral    # 殡仪馆自助终端
pnpm build          # 生产构建（main + preload + renderer）
pnpm test           # 平台单测（packages/core，vitest）
pnpm typecheck      # 全 workspace 类型检查
pnpm lint           # 代码检查
pnpm lint:fix       # 代码检查 + 格式化（antfu eslint 即 formatter）
pnpm gen:app <slug> <中文名>   # 生成新 App 骨架（kiosk 形态）
pnpm hotfix <app>   # 打包 asar 热更发布物（asar + 清单）
```

## 开发指南

### 注册一个 App

在应用入口（`apps/desktop/electron/main/index.ts`）通过 `bootstrap` 配置：

```ts
import { bootstrap } from '@desktop/core'
import type { DesktopAppManifest } from '@desktop/shared'

const crm: DesktopAppManifest = {
  id: 'crm',
  name: 'CRM',
  version: '1.0.0',
  type: 'internal',
  entry: { type: 'web', url: 'https://example.com' },
  permissions: ['storage', 'clipboard.read'],
}

bootstrap({
  app: { id: 'com.company.desktop', name: 'Desktop', version: '1.0.0' },
  window: { width: 1200, height: 800, minWidth: 960, minHeight: 640 },
  apps: { allowThirdParty: false, manifests: [crm] },
})
```

- `permissions` 决定该 App 在 Session 级权限请求与 `storage:*` 通道的准入；未声明的全部拒绝
- `icon` / `browserWindowOptions` / `webPreferences` / `permissions`（session 级）是 Electron 逃生口，按需平铺在 bootstrap 入参上

### Renderer 调用平台

Shell renderer 中通过 `window.desktop`（类型为 `@desktop/shared` 的 `DesktopApi`）：

```ts
// 打开 App（平台决定实例与 URL）
const tab = await window.desktop.tabs.open({ appId: 'crm' })

// 监听 Tab 变化（全量推送，无 diff）
const off = window.desktop.events.on('tabs:updated', (tabs) => {
  renderTabs(tabs)
})

// 存取数据（Main 按 CallerResolver 识别身份，自动落到 app-<appId>.json）
await window.desktop.storage.set('lastVisited', Date.now())
const last = await window.desktop.storage.get<number>('lastVisited')

// 权限查询（仅展示用，实际授权在 Main）
const canRead = await window.desktop.permission.check('storage')
```

### 同步 Shell 布局

Shell 用 `ResizeObserver` 观察内容区，把矩形传给平台，激活的 WebContentsView 会 setBounds 到该区域：

```ts
window.desktop.tabs.setWorkArea({ x, y, width, height })
```

### 新增一个平台能力（以「剪贴板」为例）

固定三步，目录一一对应，看完任意现有域照抄即可：

1. **契约**：`packages/shared/src/types/ipc/` 新建 `clipboard.ts`（type alias，双形态），并在 `ipc/index.ts` 的并集里追加 `& ClipboardIpc`
2. **注册**：`packages/core/src/ipc/` 新建同名 `clipboard.ts`（`registerClipboardIpc(deps)`，只依赖本域 Service），并在 `ipc/index.ts` 编排器里追加一行
3. **实现**：能力逻辑放 `packages/core/src/<domain>/`（一域一目录，构造器注入，域间用 EventBus 或装配根解耦）

配好 `DesktopApi`（`shared/src/types/api.ts`）后 Renderer 侧 `window.desktop` 即可调用；preload 通道白名单 `satisfies` 契约约束拼写。跑 `pnpm --filter @desktop/core test` 补一个域测试。

### 创建一个新 App

```bash
pnpm gen:app census 人口普查自助终端
pnpm install                                  # 建立 workspace 链接
pnpm --filter @app/census dev                 # 启动
```

生成的是 kiosk 形态骨架（全屏单应用 + 韧性 + 三件套：入口 `bootstrap` / 配置 `bootstrap 参数` / 脚本 `dev|build|typecheck`）。Tab Shell 形态请复制 `apps/desktop` 改造。

### 更新体系（全 app 支持：整包 + asar 热更双通道）

打包产物为引导器两层结构（`packages/core/scripts/after-pack.cjs` 全 app 共享）：

```
resources/app.asar        ← KB 级引导器，永不更新，启动时裁决加载哪份代码
resources/app.core.asar   ← 真实全部代码，热更换的就是它
```

更新判据：改了业务代码/UI → asar 热更（1.4MB 级，重启生效）；升级 Electron / 新增原生依赖 / 改安装配置 → 整包。安装均配置 `perMachine: false`（用户级目录），更新链路全程零 UAC。

```bash
pnpm hotfix               # 交互引导（选 App → 确认版本 → 自动打包出发布物）
pnpm hotfix funeral       # 直通模式（非交互，CI 用），自动先打包
#   产物: apps/<app>/dist/hotfix/ 下 core-<version>.asar + update-manifest.json
#   可选: --version 1.0.1 指定发布版本；--no-build 跳过打包（仅调试）
```

热更两个文件上传到 `updates.asar` 指向的服务器目录即完成发布；客户端下载后 sha256 强校验、写 pending 标记，重启由引导器完成指针切换（运行中绝不替换 asar——规避 Windows 文件锁，指针切换 + 60s 判活回滚防变砖）。整包走 electron-updater（`latest.yml` + exe 上传到 `updates.url`），退出时自动安装。端到端验证服务器：`pnpm exec tsx scripts/e2e-update-server.ts`。

## 约定

- 格式化统一使用 `pnpm lint:fix`（antfu eslint 规则体系），不引入 Prettier
- `@desktop/*` 为平台包；App 专属逻辑只写在 `apps/desktop`，core 不含业务
- 所有类型（含 IPC 契约、权限枚举）统一收敛在 `packages/shared/src/types`
