# Desktop Platform

类飞书桌面平台的 Electron monorepo：一个 Shell（窗口框架 + 标签页容器）承载多个 Web App，平台提供统一的安全基线、IPC 契约、会话与存储隔离。

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
│   └── kiosk/                # 形态二：自助机（单应用全屏，无 Tab Shell）
│       ├── electron/main/    # bootstrap：kiosk 窗口（fullscreen + kiosk: true）
│       └── src/              # 自有业务 UI，直接渲染
├── packages/
│   ├── shared/               # IPC 契约与全部类型（DesktopIpc / DesktopApi / 权限）
│   ├── core/                 # 平台核心（不含任何业务）
│   │   └── src/
│   │       ├── app/          #   AppRegistry / AppService（App 生命周期）
│   │       ├── runtime/      #   DesktopRuntime（组装根）+ bootstrap 入口
│   │       ├── event/        #   EventBus（进程内事件）
│   │       ├── ipc/          #   handle 包装 / CallerResolver / 通道注册
│   │       ├── logger/       #   electron-log：文件轮转 / 崩溃捕获 / renderer 控制台桥接
│   │       ├── permission/   #   PermissionService（默认全拒）
│   │       ├── session/      #   SessionService（persist:app-<appId> 隔离）
│   │       ├── storage/      #   StorageService（electron-store，每 App 一个文件）
│   │       ├── tab/          #   TabService（创建/激活/关闭）
│   │       ├── web/          #   WebService（WebContentsView 容器）
│   │       ├── window/       #   WindowService + 安全防护
│   │       └── preload/      #   最小桥 window.desktop
│   ├── config/               # tsconfig.base.json / eslint factory
│   └── vite-config/          # electron-vite 配置工厂（强制 preload 输出 .cjs）
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

全部 IPC 通道定义在 `packages/shared/src/types/ipc.ts` 的 `DesktopIpc`（type alias），双形态：

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

## 快速开始

```bash
pnpm install        # 安装依赖
pnpm dev            # 启动桌面应用（dev 模式，HMR）
pnpm dev:kiosk      # 启动自助机应用（全屏 kiosk 形态）
pnpm build          # 生产构建（main + preload + renderer）
pnpm typecheck      # 全 workspace 类型检查
pnpm lint           # 代码检查
pnpm lint:fix       # 代码检查 + 格式化（antfu eslint 即 formatter）
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

## 约定

- 格式化统一使用 `pnpm lint:fix`（antfu eslint 规则体系），不引入 Prettier
- `@desktop/*` 为平台包；App 专属逻辑只写在 `apps/desktop`，core 不含业务
- 所有类型（含 IPC 契约、权限枚举）统一收敛在 `packages/shared/src/types`
