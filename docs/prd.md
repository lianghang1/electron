# Electron Desktop Platform 基础脚手架

## 1. 项目定位

从 0 创建一个基于 Electron + electron-vite + Vue 3 + TypeScript + pnpm workspace 的通用桌面平台基础项目。

这个项目的长期产品方向是：

> **构建一个类似飞书桌面端的通用 Desktop Platform。**

这里的“类似飞书”不是要求复制飞书 UI，而是参考其**桌面平台形态和应用承载模式**：

- 一个统一的桌面 Shell
- 左侧或顶部提供应用入口
- 应用可以像浏览器 Tab 一样打开
- 一个桌面客户端可以同时承载多个 Web 应用
- 内部应用和第三方应用统一进入平台
- 应用之间有清晰的身份和权限边界
- 平台统一管理窗口、Tab、Session、Storage、权限、IPC、生命周期
- 业务应用不直接接触 Electron
- 后续可以演进成企业级应用平台

长期目标类似：

```text
                         Desktop Platform
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
          Desktop Shell     App Runtime       Security
              │                 │                 │
          App Launcher          App             Permission
          Tab Bar               Instance        Policy
          Window                Session         Isolation
              │                 │                 │
              └─────────────────┼─────────────────┘
                                │
                           App Registry
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                  │
            CRM                OA             第三方应用
             │                  │                  │
          Web App            Web App            Web App
```

第一阶段不要实现完整的企业平台，只建立未来能够持续演进的核心基础设施。

---

# 2. 技术栈

使用：

- Electron
- electron-vite
- Vue 3
- TypeScript
- pnpm
- pnpm-workspace
- @electron-toolkit/typed-ipc
- @antfu/eslint-config
- Prettier

ESLint 必须使用：

```text
@antfu/eslint-config
```

不要自行设计一套 ESLint 规则体系。

---

# 3. 核心架构

严格采用：

```text
apps
  ↓
@desktop/core
  ↓
Preload
  ↓
Typed IPC
  ↓
Main Process
  ↓
Electron
```

职责：

```text
apps/*
    业务应用层

@desktop/core
    Desktop Platform 核心 API

@desktop/shared
    跨 Main / Preload / Renderer 的公共类型

@desktop/electron
    Electron 底层适配层

Preload
    安全 API Bridge

Main Process
    真正的系统能力、权限、安全策略和生命周期管理
```

业务层不直接依赖 Electron。

---

# 4.1 Renderer 安全边界

Renderer 只能通过：

```ts
window.desktop
```

访问平台能力。

例如：

```ts
await window.desktop.window.minimize()
```

```ts
await window.desktop.tabs.open({
  appId: 'crm',
})
```

```ts
await window.desktop.permission.check('clipboard.read')
```

```ts
await window.desktop.storage.get('current-user')
```

Renderer 不直接使用 Electron API。

---

# 4.2 Preload

Preload 使用 Electron 官方：

```ts
contextBridge
ipcRenderer
```

向 Renderer 暴露：

```ts
window.desktop
```

Preload 只负责：

- API Bridge
- IPC 调用
- 参数传递
- 类型约束

不要把业务逻辑放进 Preload。

---

# 4.3 IPC

使用：

```text
@electron-toolkit/typed-ipc
```

建立类型安全 IPC。

不要在业务代码中散落：

```ts
ipcRenderer.invoke('xxx')
```

统一定义 IPC Contract。

例如：

```ts
interface DesktopIpc {
  'window:minimize': {
    args: []
    result: void
  }

  'window:maximize': {
    args: []
    result: void
  }

  'tabs:open': {
    args: [OpenTabOptions]
    result: DesktopTab
  }

  'tabs:close': {
    args: [string]
    result: void
  }

  'permission:check': {
    args: [Permission]
    result: boolean
  }
}
```

具体 API 以当前 `@electron-toolkit/typed-ipc` 版本为准，不要虚构不存在的 API。

---

# 5. Monorepo 目录

创建：

```text
desktop-platform/
│
├── apps/
│   ├── desktop/
│   │   ├── src/
│   │   │   ├── main/
│   │   │   ├── preload/
│   │   │   └── renderer/
│   │   ├── electron.vite.config.ts
│   │   └── package.json
│   │
│   └── playground/
│       ├── src/
│       └── package.json
│
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── application/
│   │   │   ├── event/
│   │   │   ├── ipc/
│   │   │   ├── logger/
│   │   │   ├── permission/
│   │   │   ├── session/
│   │   │   ├── storage/
│   │   │   ├── tab/
│   │   │   ├── web/
│   │   │   ├── window/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── electron/
│   │   ├── src/
│   │   │   ├── adapters/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── shared/
│   │   ├── src/
│   │   │   ├── types/
│   │   │   ├── constants/
│   │   │   ├── errors/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── ui/
│   │   ├── src/
│   │   └── package.json
│   │
│   └── config/
│       ├── eslint/
│       ├── typescript/
│       └── package.json
│
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.json
└── README.md
```

第一阶段重点建设：

```text
packages/shared
packages/core
packages/electron
apps/desktop
apps/playground
```

---

# 6. Package 命名

统一：

```text
@desktop/core
@desktop/shared
@desktop/electron
@desktop/ui
@desktop/config
```

避免使用：

```text
common
utils
helpers
misc
electron-utils
common-utils
```

这种容易逐渐变成垃圾桶的 Package。

---

# 7. @desktop/shared

只存放跨进程公共类型和纯代码。

禁止依赖：

```text
electron
node
BrowserWindow
WebContents
Session
```

定义：

```text
Permission
DesktopAppManifest
AppContext
AppInstance
DesktopTab
DesktopConfig
AppSecurityPolicy
CallerContext
DesktopError
IPC Contract
```

---

# 8. App 模型

必须从第一天区分：

```text
App
AppInstance
Tab
```

## App

表示应用定义。

例如：

```text
CRM
OA
财务系统
项目管理
```

## AppInstance

表示正在运行的应用实例。

## Tab

表示用户界面中的 Tab。

关系：

```text
App
 ↓
AppInstance
 ↓
Tab
 ↓
WebContents
```

第一阶段可以默认一个 App 只有一个活跃 Instance，但模型不能把：

```text
appId === instanceId
```

写死。

---

# 9. DesktopAppManifest

定义：

```ts
export interface DesktopAppManifest {
  id: string

  name: string

  version: string

  type: 'internal' | 'third-party'

  entry: {
    type: 'web'
    url: string
  }

  icon?: string

  permissions?: Permission[]

  security?: AppSecurityPolicy
}
```

例如：

```ts
const crmApp: DesktopAppManifest = {
  id: 'crm',

  name: '客户管理',

  version: '1.0.0',

  type: 'internal',

  entry: {
    type: 'web',
    url: 'https://crm.example.com',
  },

  permissions: ['storage', 'clipboard.read', 'notification'],
}
```

---

# 10. AppRegistry

实现：

```ts
class AppRegistry {
  register(app: DesktopAppManifest): void

  unregister(appId: string): void

  get(appId: string): DesktopAppManifest | undefined

  has(appId: string): boolean

  list(): DesktopAppManifest[]
}
```

AppRegistry 只负责应用定义管理。

不要和 Vue UI 绑定。

未来 AppRegistry 可以从本地配置扩展到：

```text
远程配置中心
企业应用中心
应用市场
```

---

# 11. AppService

负责运行中的 App 生命周期：

```ts
class AppService {
  open(appId: string): Promise<AppInstance>

  close(instanceId: string): Promise<void>

  get(instanceId: string): AppInstance | undefined

  list(): AppInstance[]

  getCurrent(): Promise<AppContext>
}
```

生命周期：

```text
registered
    ↓
opening
    ↓
opened
    ↓
closing
    ↓
closed
```

---

# 12. AppContext

定义：

```ts
export interface AppContext {
  appId: string

  instanceId: string

  manifest: DesktopAppManifest

  permissions: Permission[]

  createdAt: number
}
```

所有 Platform API 都应该能够确定当前调用者所属的：

```text
appId
instanceId
tabId
```

---

# 13. CallerContext

定义：

```ts
export interface CallerContext {
  appId: string

  instanceId: string

  tabId?: string
}
```

Main Process 根据 IPC 调用来源确定 CallerContext。

不要信任 Renderer 自己传入：

```text
appId
instanceId
tabId
```

例如 Renderer 不应该可以伪造：

```ts
{
  appId: 'admin'
}
```

来访问其他应用资源。

---

# 14. Permission System

第一阶段实现 App Permission。

定义：

```ts
export type Permission =
  | 'storage'
  | 'clipboard.read'
  | 'clipboard.write'
  | 'notification'
  | 'window'
  | 'network'
  | 'download'
  | 'upload'
  | 'filesystem.read'
  | 'filesystem.write'
```

实现：

```ts
class PermissionService {
  check(context: CallerContext, permission: Permission): Promise<boolean>

  assert(context: CallerContext, permission: Permission): Promise<void>

  getPermissions(appId: string): Promise<Permission[]>
}
```

真正的权限检查必须发生在 Main Process。

---

# 15. Permission 安全原则

正确：

```text
Renderer
   ↓
IPC
   ↓
Main
   ↓
CallerContext
   ↓
PermissionService
   ↓
系统操作
```

不能：

```text
Renderer
   ↓
自己判断权限
   ↓
执行系统操作
```

Renderer 的权限状态只用于 UI。

Main Process 才拥有最终授权权。

---

# 16. StorageService

实现：

```ts
class StorageService {
  get<T>(context: CallerContext, key: string): Promise<T | undefined>

  set<T>(context: CallerContext, key: string, value: T): Promise<void>

  remove(context: CallerContext, key: string): Promise<void>

  clear(context: CallerContext): Promise<void>
}
```

Storage 必须按照 App 隔离。

例如：

```text
CRM
  current-user = Alice

OA
  current-user = Bob
```

CRM 不能访问 OA Storage。

Renderer 不允许传入任意 `appId` 读取其他 App 数据。

App 身份由 Main Process 根据 CallerContext 确定。

第一阶段使用简单可靠的本地持久化方案，不引入复杂数据库。

---

# 17. SessionService

每个 Web App 默认拥有独立 Session。

目标：

```text
CRM
 └── Session CRM

OA
 └── Session OA

第三方 App
 └── Session ThirdParty
```

不同 App 默认隔离：

```text
Cookie
LocalStorage
SessionStorage
Cache
Session
```

实现：

```ts
class SessionService {
  getSession(appId: string): Session

  destroySession(appId: string): Promise<void>
}
```

具体实现根据当前 Electron 版本使用合适的 Session / partition 机制。

---

# 18. Tab Model

定义：

```ts
export interface DesktopTab {
  id: string

  appId: string

  instanceId: string

  title: string

  icon?: string

  url: string

  active: boolean

  closable: boolean

  createdAt: number
}
```

实现：

```ts
class TabService {
  list(): DesktopTab[]

  open(options: OpenTabOptions): Promise<DesktopTab>

  close(tabId: string): Promise<void>

  activate(tabId: string): Promise<void>

  reload(tabId: string): Promise<void>
}
```

---

# 19. Tab 与 WebContents

不要把 Electron Runtime Object 放进共享 Tab Model。

禁止：

```ts
interface DesktopTab {
  webContents: WebContents
}
```

正确：

```text
DesktopTab
   ↓
tabId
   ↓
WebService
   ↓
WebContents
```

Runtime 对象由 Main Process 管理。

---

# 20. Web App Container

长期目标：

```text
Desktop Shell
    │
    ├── Tab A
    │    └── Web App
    │
    ├── Tab B
    │    └── Web App
    │
    └── Tab C
         └── Web App
```

每个 Web App 拥有独立 WebContents 生命周期。

第一阶段优先使用 Electron 当前推荐的 Web 内容承载方式，例如：

```text
WebContentsView
```

不要让整个架构绑定到 iframe。

---

# 21. WebService

建立：

```ts
class WebService {
  create(context: AppContext): Promise<WebAppRuntime>

  load(runtimeId: string, url: string): Promise<void>

  reload(runtimeId: string): Promise<void>

  destroy(runtimeId: string): Promise<void>
}
```

Web Runtime 负责：

```text
WebContents
Navigation
Session
Security Policy
Lifecycle
```

---

# 22. AppSecurityPolicy

定义：

```ts
export interface AppSecurityPolicy {
  allowedOrigins?: string[]

  allowNavigation?: boolean

  allowPopups?: boolean

  allowDownloads?: boolean

  allowClipboard?: boolean

  allowNotifications?: boolean

  allowFileAccess?: boolean
}
```

例如：

```ts
const crmSecurity: AppSecurityPolicy = {
  allowedOrigins: ['https://crm.example.com'],

  allowNavigation: false,

  allowPopups: false,

  allowDownloads: true,

  allowClipboard: true,
}
```

---

# 23. Web App Navigation

平台统一控制 Web App 导航。

例如：

```text
CRM
 ↓
https://crm.example.com
```

允许：

```text
https://crm.example.com/*
```

未经允许的外部域名：

```text
https://unknown.example.com
```

由 Platform 决定：

```text
当前 Tab 打开
新 Tab 打开
系统浏览器打开
拒绝
```

第三方 Web App 不应该拥有控制整个 Desktop Shell 的能力。

---

# 24. WindowService

实现：

```ts
class WindowService {
  create(): Promise<void>

  getMainWindow(): BrowserWindow | undefined

  minimize(): Promise<void>

  maximize(): Promise<void>

  close(): Promise<void>

  isMaximized(): Promise<boolean>
}
```

Electron 类型只允许存在于 Main / Electron Adapter 层。

---

# 25. EventBus

建立平台级 EventBus。

事件至少包括：

```text
app:registered
app:opened
app:closed

tab:created
tab:activated
tab:closed

permission:denied

window:created
window:closed
```

例如：

```ts
desktop.events.on('app:opened', handler)
```

不要使用 Vue EventBus 作为平台核心事件系统。

---

# 26. Logger

建立：

```ts
class Logger {
  debug(): void

  info(): void

  warn(): void

  error(): void
}
```

日志字段：

```text
timestamp
level
process
appId
instanceId
message
metadata
```

第一阶段实现本地日志。

---

# 27. DesktopApplication

Main Process 使用统一 Application 管理所有 Service。

结构：

```text
DesktopApplication
│
├── WindowService
├── AppRegistry
├── AppService
├── TabService
├── PermissionService
├── StorageService
├── SessionService
├── WebService
├── IpcService
├── Logger
└── EventBus
```

Main `index.ts` 保持简单：

```ts
import { bootstrap } from './bootstrap'

bootstrap()
```

启动：

```text
DesktopApplication
       ↓
initialize services
       ↓
register IPC
       ↓
create main window
       ↓
load renderer
```

退出：

```text
DesktopApplication
       ↓
dispose services
       ↓
destroy WebContents
       ↓
destroy windows
       ↓
quit
```

---

# 28. Service 生命周期

定义：

```ts
export interface Service {
  initialize: () => Promise<void> | void

  dispose: () => Promise<void> | void
}
```

所有拥有资源的 Service 都必须实现完整生命周期。

尤其注意：

```text
WebContents
Session
Event Listener
Timer
IPC Handler
```

不能产生资源泄漏。

---

# 29. Electron Adapter

`@desktop/electron` 用于隔离 Electron 底层实现。

例如：

```text
ElectronWindowAdapter
ElectronSessionAdapter
ElectronWebContentsAdapter
ElectronStorageAdapter
```

Core 优先依赖自己的接口。

例如：

```ts
interface WindowPort {
  minimize: () => Promise<void>

  maximize: () => Promise<void>

  close: () => Promise<void>
}
```

Electron Adapter：

```ts
class ElectronWindowAdapter implements WindowPort {
  // Electron implementation
}
```

最终：

```text
Core
 ↓
Adapter
 ↓
Electron
```

---

# 30. DesktopApi

最终暴露给 Renderer 的平台 API：

```ts
export interface DesktopApi {
  window: {
    minimize: () => Promise<void>

    maximize: () => Promise<void>

    close: () => Promise<void>

    isMaximized: () => Promise<boolean>
  }

  app: {
    getCurrent: () => Promise<AppContext>

    getManifest: (appId: string) => Promise<DesktopAppManifest | undefined>
  }

  tabs: {
    list: () => Promise<DesktopTab[]>

    open: (options: OpenTabOptions) => Promise<DesktopTab>

    close: (tabId: string) => Promise<void>

    activate: (tabId: string) => Promise<void>

    reload: (tabId: string) => Promise<void>
  }

  permission: {
    check: (permission: Permission) => Promise<boolean>
  }

  storage: {
    get: <T>(key: string) => Promise<T | undefined>

    set: <T>(key: string, value: T) => Promise<void>

    remove: (key: string) => Promise<void>
  }
}
```

---

# 31. Core API

业务开发者最终只需要使用：

```ts
import { desktop } from '@desktop/core'
```

例如：

```ts
await desktop.window.minimize()
```

```ts
const tabs = await desktop.tabs.list()
```

```ts
await desktop.tabs.open({
  appId: 'crm',
})
```

```ts
const user = await desktop.storage.get<User>('current-user')
```

```ts
const allowed = await desktop.permission.check('clipboard.read')
```

业务层不应该知道：

```text
Electron
IPC Channel
Preload
BrowserWindow
WebContents
Session
```

---

# 32. Core 多入口

根据实际实现，可以提供：

```text
@desktop/core
@desktop/core/main
@desktop/core/preload
@desktop/core/renderer
```

确保：

```text
Renderer
    ↓
@desktop/core/renderer
```

不会把 Node / Electron Main 代码打进 Renderer。

Main：

```text
@desktop/core/main
```

Preload：

```text
@desktop/core/preload
```

根据实际构建结果合理拆分，不要为了目录形式强行拆包。

---

# 33. Electron 安全配置

默认使用：

```ts
webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
}
```

Renderer 不直接拥有 Node.js 能力。

敏感系统能力必须：

```text
Renderer
 ↓
Preload
 ↓
Typed IPC
 ↓
Main
 ↓
PermissionService
 ↓
System API
```

---

# 34. 配置系统

建立统一：

```ts
interface DesktopConfig {
  app: {
    id: string

    name: string

    version: string
  }

  window: {
    width: number

    height: number

    minWidth?: number

    minHeight?: number
  }

  security: {
    sandbox: boolean

    contextIsolation: boolean

    nodeIntegration: boolean
  }

  apps: {
    allowThirdParty: boolean
  }
}
```

配置不能散落在各个 Service 中。

---

# 35. Apps/Desktop

`apps/desktop` 是平台官方 Desktop Shell。

第一阶段 UI：

```text
┌─────────────────────────────────────────────┐
│ Desktop Header                              │
├───────────────┬─────────────────────────────┤
│               │                             │
│ App Launcher  │ Tabs                        │
│               ├─────────────────────────────┤
│ CRM           │                             │
│ OA            │       Web App               │
│ Playground    │                             │
│               │                             │
└───────────────┴─────────────────────────────┘
```

第一阶段不追求最终视觉效果。

重点是验证：

```text
App
AppInstance
Tab
WebContents
Session
Permission
IPC
```

---

# 36. App Launcher

App Launcher 从：

```ts
AppRegistry
```

读取：

```ts
const apps = appRegistry.list()
```

UI 不维护自己的 App Registry。

流程：

```text
AppRegistry
     ↓
App Launcher
     ↓
Open App
     ↓
AppService
     ↓
TabService
     ↓
WebService
     ↓
Web App
```

---

# 37. Playground

创建：

```text
apps/playground
```

用于验证 Platform API。

提供测试：

```text
Window
├── Minimize
├── Maximize
└── Close

Storage
├── Get
├── Set
└── Remove

Permission
├── Allowed
└── Denied

App
├── List
├── Open
└── Close

Tab
├── Open
├── Activate
├── Reload
└── Close
```

---

# 38. 测试 App

创建两个测试 App：

```text
CRM
OA
```

例如：

```text
CRM
https://example.com

OA
https://example.org
```

主要用于测试：

```text
AppRegistry
AppInstance
Tab
WebContents
Session
Permission
Navigation Policy
```

---

# 39. Tab 行为

打开：

```text
点击 CRM
 ↓
创建 AppInstance
 ↓
创建 Tab
 ↓
创建 WebContents
 ↓
创建/获取 Session
 ↓
加载 URL
```

打开 OA：

```text
点击 OA
 ↓
创建 OA Tab
```

切换：

```text
activate(tabId)
```

刷新：

```text
reload(tabId)
```

关闭：

```text
close(tabId)
 ↓
destroy WebContents
 ↓
更新 AppInstance
 ↓
发布事件
 ↓
更新 UI
```

---

# 40. App 与 Tab

允许：

```text
一个 App
 ↓
多个 AppInstance
 ↓
多个 Tab
```

第一阶段可以默认：

```text
一个 App
 ↓
一个 Instance
```

但底层模型必须保留多 Instance 能力。

---

# 41. Security Boundary

平台必须明确：

```text
┌──────────────────────────────┐
│ Renderer / Web App           │
│                              │
│ 不可信                       │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Preload                      │
│                              │
│ 最小化 Platform API          │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Main Process                 │
│                              │
│ Trusted Platform Runtime     │
│                              │
│ Permission / Storage / FS    │
└──────────────────────────────┘
```

任何涉及：

```text
filesystem
shell
child_process
native API
系统文件
系统通知
下载
上传
```

的能力，都必须经过 Main Process。

---

# 42. IPC Caller Security

不能设计成：

```ts
ipcMain.handle('storage:get', (_, appId, key) => {
  return storage.get(appId, key)
})
```

因为 Renderer 可以伪造：

```text
appId = admin
```

必须：

```text
IPC
 ↓
识别调用来源
 ↓
CallerContext
 ↓
PermissionService
 ↓
StorageService
```

Storage、Permission、Filesystem 等敏感 API 都必须遵循这个原则。

---

# 43. 错误处理

建立统一：

```ts
class DesktopError extends Error {
  code: string

  details?: unknown
}
```

错误类型：

```text
APP_NOT_FOUND
APP_NOT_ALLOWED
PERMISSION_DENIED
TAB_NOT_FOUND
SESSION_NOT_FOUND
INVALID_ORIGIN
STORAGE_ERROR
IPC_ERROR
```

IPC 返回可序列化错误。

不要直接跨 IPC 传递复杂 Electron Error 对象。

---

# 44. IPC 数据

IPC 参数和返回值优先使用：

```text
string
number
boolean
null
array
plain object
```

不要跨 IPC 传递：

```text
BrowserWindow
WebContents
Session
Node Stream
复杂 class instance
```

Electron Runtime Object 必须留在 Main Process。

---

# 45. UI Package

`@desktop/ui` 只放真正复用的基础组件。

第一阶段可以包含：

```text
Button
Tabs
Dialog
AppIcon
AppLauncher
WindowControls
```

不要提前建立大型 UI Framework。

---

# 46. ESLint

必须使用：

```text
@antfu/eslint-config
```

使用官方推荐配置方式。

ESLint 配置统一放在：

```text
packages/config/eslint
```

或者 Root 配置，根据 Monorepo 最合理的方式组织。

所有 Workspace Package 使用统一 ESLint 配置。

不要自己重新维护大量规则。

---

# 47. TypeScript

开启严格模式：

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

避免使用：

```ts
any
```

跨层 API 必须具有明确类型。

---

# 48. electron-vite

使用标准 electron-vite 架构。

配置：

```text
electron.vite.config.ts
```

包含：

```text
main
preload
renderer
```

充分使用 electron-vite 的：

```text
Vite
TypeScript
Main Process
Preload
Renderer
HMR
Build
```

不要重新实现 Electron 构建系统。

---

# 49. Root Scripts

Root 至少提供：

```json
{
  "scripts": {
    "dev": "pnpm --filter @desktop/desktop dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint",
    "format": "prettier --write ."
  }
}
```

根据最终项目结构调整实际命令。

---

# 50. 第一阶段必须完成

## Workspace

- pnpm workspace
- TypeScript
- Vue 3
- Electron
- electron-vite
- ESLint
- @antfu/eslint-config
- Prettier

## Platform

- DesktopApplication
- WindowService
- AppRegistry
- AppService
- TabService
- PermissionService
- StorageService
- SessionService
- WebService
- Logger
- EventBus
- IPC

## Security

- contextIsolation
- sandbox
- nodeIntegration=false
- Main Process 权限检查
- CallerContext
- App 身份隔离
- App Storage 隔离
- App Session 隔离
- Navigation Policy

## UI

- Desktop Shell
- App Launcher
- Tab Bar
- Web App Container

## Playground

- Window Test
- Storage Test
- Permission Test
- App Test
- Tab Test

---

# 51. 第一阶段暂不实现

暂时不要实现：

```text
App Marketplace
App Installer
App Update
SSO
Organization
RBAC
Remote Config
App Review
App Signing
Plugin Marketplace
复杂 Plugin System
支付
服务器
数据库服务
微服务
Docker
Kubernetes
```

但是数据模型和 Service 边界必须允许未来扩展。

---

# 52. 未来演进方向

长期架构可以逐步演进为：

```text
                         Desktop Platform
                                │
                         Desktop Shell
                                │
                         App Runtime
                                │
                         App Registry
                                │
               ┌────────────────┼────────────────┐
               │                │                │
             Internal         Enterprise       Third Party
               App              App                App
               │                │                │
             Session          Session            Session
               │                │                │
           Permission       Permission         Permission
               │                │                │
               └────────────────┼────────────────┘
                                │
                         Security Runtime
```

再增加：

```text
App Marketplace
App Installer
App Update
SSO
Organization
RBAC
Remote Config
App Signing
Audit Log
Crash Report
Analytics
Plugin System
```

最终让开发者新增一个业务应用时，只需要：

```text
apps/my-app
```

然后使用：

```ts
import { desktop } from '@desktop/core'
```

而不需要重新学习 Electron。

---

# 53. 开发原则

严格遵循：

```text
架构边界清晰
类型安全
IPC 安全
权限安全
App 隔离
Session 隔离
生命周期完整
代码简单
```

不要为了未来可能使用而提前增加复杂抽象。

不要一次生成大量代码。

每个阶段：

```text
实现
 ↓
typecheck
 ↓
lint
 ↓
build
 ↓
运行验证
 ↓
修复
 ↓
下一阶段
```

---

# 54. 最终验收

执行：

```bash
pnpm install
pnpm dev
```

必须成功启动 Desktop。

然后验证：

### Window

```text
最小化
最大化
关闭
```

### App

```text
注册 App
查看 App
打开 App
关闭 App
```

### Tab

```text
打开 Tab
切换 Tab
刷新 Tab
关闭 Tab
```

### Web App

```text
CRM
OA
```

可以同时运行。

### Storage

```text
CRM:
user = Alice

OA:
user = Bob
```

互相不能读取。

### Permission

例如：

```text
CRM:
clipboard.read = allow

OA:
clipboard.read = deny
```

Main Process 必须实际阻止 OA。

### Session

```text
CRM Session
≠
OA Session
```

### Navigation

未经 App Security Policy 允许的 Origin 必须受到平台控制。

### Security

Renderer / Web App：

```text
不能直接访问 Node.js
不能直接访问 Electron
不能直接执行系统命令
不能绕过 PermissionService
不能伪造其他 App 身份
不能读取其他 App Storage
```

---

# 55. AI Coding 执行顺序

严格按照以下顺序执行：

## Phase 1

创建：

```text
apps/desktop
apps/playground

packages/core
packages/shared
packages/electron
packages/ui
packages/config
```

完成：

```bash
pnpm install
```

---

## Phase 2

实现：

```text
@desktop/shared
```

包括：

```text
Permission
DesktopAppManifest
AppContext
AppInstance
DesktopTab
DesktopConfig
AppSecurityPolicy
CallerContext
DesktopError
IPC Contract
```

---

## Phase 3

实现：

```text
electron-vite
Main
Preload
Renderer
BrowserWindow
Security
```

确认：

```bash
pnpm dev
```

正常。

---

## Phase 4

实现：

```text
contextBridge
ipcRenderer
window.desktop
typed IPC
```

先打通：

```text
window:minimize
window:maximize
window:close
```

验证：

```text
Renderer
 ↓
window.desktop
 ↓
Preload
 ↓
Typed IPC
 ↓
Main
 ↓
Electron
```

---

## Phase 5

实现：

```text
Logger
EventBus
WindowService
PermissionService
StorageService
SessionService
AppRegistry
AppService
WebService
TabService
```

---

## Phase 6

实现：

```text
DesktopApplication
```

统一管理 Service 生命周期。

---

## Phase 7

实现 Desktop Shell：

```text
App Launcher
Tab Bar
Web App Container
```

---

## Phase 8

实现 Playground：

```text
Window Test
Storage Test
Permission Test
App Test
Tab Test
```

---

## Phase 9

执行：

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm dev
```

修复所有错误。

---

# 56. 最终要求

现在直接开始创建项目并执行 Phase 1 → Phase 9。

不要先输出长篇理论说明。

每完成一个 Phase：

1. 检查项目结构
2. 执行 typecheck
3. 执行 lint
4. 执行 build
5. 可运行阶段执行 dev 验证
6. 修复错误
7. 再进入下一阶段

最终输出：

```text
项目结构
核心架构
启动方式
开发方式
Core API 使用示例
测试结果
```

最终必须保证：

```text
Electron
只是底层 Runtime

@desktop/core
才是业务开发者面对的 Platform API
```

整个项目要围绕“**类似飞书桌面端的企业级 Web App Desktop Platform**”这个长期目标设计，但第一阶段保持简单、可运行、可维护，不提前实现复杂企业功能。
