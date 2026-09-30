# App 接入指南

> 面向两类读者：① 把 Web 系统接入 Desktop Shell 的团队；② 基于 Kiosk 形态开发自助终端业务的开发者。
> 工程背景见 [README](../README.md)，进度与架构决策见 [ROADMAP](./ROADMAP.md)。平台能力域的实现细节以代码为唯一事实源（契约即文档：`packages/shared/src/types/`）。

## 一、选择接入形态

| 形态 | 适用 | 承载方式 | 入口 |
| --- | --- | --- | --- |
| **Web App** | 内部管理系统、已有 Web 站点 | Shell 多 Tab，WebContentsView 容器，进程/Session 硬隔离 | 注册 manifest |
| **Kiosk App** | 自助终端、全屏单应用业务 | 独立应用（无 Tab Shell），renderer 直接渲染业务 UI | `pnpm gen:app` 脚手架 |

## 二、Web App 接入（Desktop Shell）

### 1. 注册 manifest

App 清单有三种来源，冲突时**代码注册优先**：

| 来源 | 说明 |
| --- | --- |
| 代码内置 | bootstrap 入参 `apps.manifests`，保底 |
| 本地文件 | `<userData>/apps.json`，免重编译增删 App |
| 远程源 | `apps.remoteUrl` 异步拉取；**必须**配置 `apps.remoteOrigins` origin 白名单（精确含协议端口），不配置 = 整体禁用 |

```ts
import { bootstrap } from '@desktop/core'
import type { DesktopAppManifest } from '@desktop/shared'

const crm: DesktopAppManifest = {
  id: 'crm',
  name: 'CRM',
  version: '1.0.0',
  type: 'internal',            // internal=平台自己人；third-party 按更严格策略处理
  entry: { type: 'web', url: 'https://crm.example.com' },
  permissions: ['storage', 'clipboard.read'],   // 见下节权限模型
  security: { allowedOrigins: ['https://crm.example.com'] },
}
```

- `type: 'internal'` 的 App 注入平台 preload（获得 `window.desktop` 桥）；`third-party` 保持无桥隔离
- 联调远程源：环境变量 `DESKTOP_APPS_ORIGINS`（白名单）与 `DESKTOP_APPS_REMOTE`（清单 URL）

### 2. 权限模型

权限词汇表唯一来源：`packages/shared/src/types/permission.ts`（`PERMISSIONS` 数组）。

`storage` `clipboard.read` `clipboard.write` `notification` `window` `network` `download` `upload` `filesystem.read` `filesystem.write` `media` `geolocation` `fullscreen` `pointerLock` `display-capture`

两层授权机制：

1. **声明式**：manifest `permissions` 里声明 → 直接放行（同时映射到 Chromium session 权限，如 `clipboard.read` → `clipboard-read`、`notification` → `notifications`）
2. **运行时授权**：manifest 未声明的 session 权限 → Main 推送 Shell 底部授权条 → 用户决策（30s 超时拒绝）；**允许的决策持久化**到 `userData/platform-permissions.json`，重启不再重复询问

红线：权限默认全拒（`clipboard-sanitized-write` 除外）；`storage:*` 等无 session 对应物的平台权限走 IPC 身份校验（CallerResolver 反查，契约参数永不携带 appId）。

### 3. 安全策略（manifest.security）

平台替 App 执行的行为约束：`allowedOrigins` / `allowNavigation` / `allowPopups` / `allowDownloads` / `allowClipboard` / `allowNotifications` / `allowFileAccess`。未列出的外部域名导航交给系统浏览器。进程级基线（sandbox / contextIsolation / nodeIntegration 等）由 core 写死，**不可配置**。

### 4. 页面里调用平台

internal App 的页面通过 `window.desktop`（类型来自 `@desktop/shared` 的 `DesktopApi`）：

```ts
// 存储（业务数据必须走这里，勿用 localStorage——按 origin 隔离的 LevelDB 会破坏平台隔离模型）
await window.desktop.storage.set('lastVisited', Date.now())

// 通知（右下角平台 toast，需声明 notification 权限）
await window.desktop.notification.show({ title: '备份完成', body: '今日增量 128 条' })

// 下载由平台接管：页面触发 <a download> 即走平台域（进度/完成推 Shell），需声明 download 权限

// 权限查询（仅展示用）
const list = await window.desktop.permission.list('crm')
```

## 三、Kiosk App 接入（自助终端）

### 1. 生成骨架

```bash
pnpm gen:app census 人口普查自助终端
pnpm install                      # 建立 workspace 链接
pnpm --filter @app/census dev
```

生成 kiosk 形态三件套（入口 `bootstrap` / 全屏窗口 / dev|build|typecheck 脚本），含韧性默认配置。

### 2. 配置面（DesktopConfig）

- `window` 只放语义层通用项（title/width/height）；**Electron 其余属性一律走 `WindowOverrides.browserWindowOptions` 透传**，不要逐个上语义层
- `features.tabs: false` 关闭 Tab 体系（kiosk 已默认）
- 无人值守标配：`resilience`（crashReload / autoLaunch / exitGuard / scheduledRestart 凌晨定时重启，动作择优 = 热更 > 整包 > 纯重启）+ `download.saveAs: false` 静默下载
- 更新：`updates.url`（整包，不配即关闭）+ `updates.asar`（热更清单）

### 3. 业务契约三步（App 本地，业务词汇不进平台包）

以 funeral 的 `fh:*` 段为例（`apps/funeral/src/types/ipc.ts`）：

1. **契约**：`src/types/ipc.ts` 用 **type alias**（interface 会被 lint 转写导致契约失效）定义 `FhIpc`
2. **注册**：Main 侧 `createHandle<FhIpc>()` 注册 handler
3. **白名单 + 收口**：preload `exposeDesktop({ appChannels: [...] satisfies (keyof FhIpc)[] })`；renderer 经 `window.desktop.$invoke(channel, ...args)`，由 `src/api/` 薄封装收口类型（见 `apps/funeral/src/api/fh.ts`）

漏掉任何一步都会编译报错（typecheck 兜底）。

### 4. 外设接入（device:* 通用层）

读卡器/打印机等通用外设由 core `DeviceService` 统一注册（payload 校验 + 打印频控 12/min），契约固定为 `device:idcard:read` / `device:printer:print`。厂商 SDK 差异收敛到两个 Driver 接口，App **最多写一个 Driver 文件，不碰契约**：

```ts
import type { CardReaderDriver, PrinterDriver } from '@desktop/core'

const myReader: CardReaderDriver = {
  readIdCard: () => sdk.read(),          // 无卡/失败返回 null，平台统一兜底
}
const myPrinter: PrinterDriver = {
  print: (ticket) => sdk.print(ticket),  // resolve = 出纸完成，抛错平台记录并透传
}

bootstrap({
  // ...DesktopConfig 与 WindowOverrides 平铺
  devices: { cardReader: myReader, printer: myPrinter },
})
```

平台缺省内置 mock Driver，业务页可先行开发；真实接入只改 Driver 注入，契约与页面零改动。

### 5. 触屏交互约定（funeral 已示范）

- 数字输入用 NumPad（纯键位网格，无内部状态）
- 运维设置入口：单位名 5 秒内连点 3 次 + NumPad 密码（`adminPassword`，默认 `888888`）
- 设置面板打开时暂停「无操作回首页」计时器；单据预览 10s 自动返回
- 所有超时路径走统一出口并发审计事件

## 四、发布

### 配置与打包

- electron-builder 配置以 `apps/<app>/electron-builder.yml` 为**唯一源**（package.json 的 `build` 字段会整体覆盖 yml，禁用）
- Windows 无人值守：`oneClick: true` + `perMachine: false`（用户级目录，更新链路零 UAC）
- 产物为引导器两层结构：`app.asar`（KB 级引导器，永不更新）+ `app.core.asar`（真实代码，热更换它）

### 整包 vs 热更判据

| 改动 | 通道 |
| --- | --- |
| 业务代码 / UI / 平台 core 代码 | **asar 热更**（MB 级，重启生效） |
| Electron 升级 / 原生依赖 / 安装配置 | **整包** |

### 发布流程

```bash
pnpm hotfix               # 交互模式：选 App → 确认版本 → 自动打包出发布物
pnpm hotfix funeral       # 直通模式（CI 用），可选 --version 1.0.1 / --no-build
```

产物 `apps/<app>/dist/hotfix/{core-<version>.asar, update-manifest.json}` 两个文件上传到 `updates.asar` 指向的服务器目录即完成发布。客户端 sha256 强校验 → pending 标记 → 重启由引导器指针切换（运行中绝不替换 asar）→ 60s 判活失败自动回滚防变砖。整包则 exe + latest.yml 上传 `updates.url`，退出时自动安装。

联调开关：`DESKTOP_UPDATE_FEED`（本地 feed 服务器）；端到端验证 `pnpm exec tsx scripts/e2e-update-server.ts <app>`。

## 五、回归验证

```bash
pnpm test         # 平台单测（packages/core vitest）
pnpm typecheck    # 全 workspace（契约三步一致性兜底）
pnpm lint:fix     # antfu eslint 即 formatter
```

浮层/弹窗/下载/菜单等运行时行为用 CDP 探针回归（dev 模式运行中执行）：见 `scripts/probe/`（每个探针自带权限复位等前置，可重复执行）。
