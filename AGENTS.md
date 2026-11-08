# 壳平台 v2 · 工程宪法

> v2 颠覆性重构已启动（next 分支）。本文件是全仓唯一约定来源，新代码必须遵守。

## 三铁律

1. **创建集中**：全仓库唯一组装现场是 `apps/shell/electron/main/index.ts`（组合根）。其余模块只经构造函数接收依赖，禁止跨模块 new。
2. **反转控制**：平台只认识接口。应用形态 = `AppOpener` 策略；更新 = `UpdateChannel` 策略；整包落地 = `PackageInstaller` 策略；硬件域 = `defineDomain` 自描述。平台差异收敛为数据表由组合根查表装配，平台代码里禁止 `switch (entry.kind)` / `if (process.platform)` 式分发。
3. **依赖单向**：UI → 服务 → 领域/基础设施。每层之间只有一个门面（渲染层只见 `@shell/bridge`）。下层禁止 import 上层。

## 模块解析（workspace 源码直引）

`packages/*` 是一等 workspace 包，靠 pnpm 符号链接解析，**源码直接引用，中间没有构建层**：

- `exports` / `main` / `types` 一律指向 `src/*.ts`；禁止指向 `dist/*`。
- 禁止给内部包配置逐包打包器（tsdown / tsc build）或 `build`/`dev` 构建脚本；`pnpm dev`、`pnpm build` 零前置构建。
- electron-vite 用 `externalizeDeps: false` 把 `.ts` 源码与依赖内联进 bundle（asar 内无 node_modules，外部化裸导入会失效）。
- 纯 Node 脚本（e2e、构建期资产聚合）经 `tsx` 或 `.mjs` 源码模块加载，不依赖任何构建产物。

## 词汇表（唯一叫法，禁用别名）

| 概念 | 命名 | 禁用 |
|---|---|---|
| 壳主窗 | ShellWindow / 工作台 | 主窗、main 窗 |
| 全屏锁定模式 | KioskMode（行为，不是窗口类型） | kiosk 窗口 |
| 浮层窗 | Overlay（Capture/Permission/Menu/AppCenter/Settings） | popup |
| 应用定义 | AppManifest（entry: embedded/packaged/remote 三形态） | app config |
| 运行中应用 | AppInstance | session、context |
| 设备域 | Domain | module、feature |
| 产品形态 | Flavor | app、edition |
| 构建目标平台 | BuildPlatform（win32 / darwin / linux） | 与 Platform（硬件能力平台）混用 |
| 整包落地策略 | PackageInstaller（组合根按平台注入） | 通道内写死 `.exe` / `/S` / spawn |
| 窗口创建 | 目的命名函数（createShellWindow / openCaptureOverlay...） | 裸 new BrowserWindow |

## 命名规范

- IPC/域方法：`域.动词名词`（get/list/create/update/remove/open/close）
- 事件：过去式（`app.opened`、`update.failed`），契约见 `@shell/shared` events
- 布尔：is/has/should/can 前缀；文件 kebab-case；类 PascalCase
- 同一概念在契约/实现/UI 三处永远同名

## 注释红线

**只写代码本身说不出来的信息**（为什么/坑/边界）。描述性注释（复述函数名）、过程性注释（"先…再…最后…"）一律不写。修复类注释必须写明触发条件与机制。

## 依赖规则（eslint 边界，M1 落地强制）

- `@shell/ui` 禁 import `@shell/devices` / `electron`
- `@shell/kernel`、`@shell/shared` 禁 import 上层包
- `packages/*` 之间只能按"shared ← kernel ← window/app-runtime/devices/update ← apps"方向引用
