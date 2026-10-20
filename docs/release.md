# 发布手册

版本纪律与服务器接口契约见 [`update-server.md`](./update-server.md)；本文件是发布操作流程。

## 通用前置

1. `pnpm typecheck && pnpm lint && pnpm test` 全绿。
2. 确认 `pnpm-workspace.yaml` 版本变动已提交（catalog / 依赖变更影响所有应用）。
3. 设备驱动文件有更新时，确认改的是 `packages/core/src/devices/**/assets/`（单一来源），并随**整包**发布。

## 发布通道判定

| 变更内容 | 通道 | 依据 |
|---|---|---|
| 仅主进程/渲染层 JS（`out/` 内 bundle） | 热更 | 默认通道，分钟级下发 |
| 原生依赖（.node / koffi）、`resources/`（厂商 DLL、SumatraPDF、内置页面）、Electron 版本、引导器、打包配置 | 整包 | asar 纯 JS 契约被触碰，热更包无法携带 |
| 热更依赖新版 resources 能力 | 热更 + 整包配合 | 热更加 `--min-resources-version <整包版本>` 门槛，旧 resources 设备自动 blocked 跳过，等整包先行 |

版本纪律：热更 version **严格大于该应用线上所有已发布版本**；整包 version **必须大于线上最高热更 version**（否则整包被热更压制）。回滚 = 发布更高版本携带旧包，客户端永不降级。

## 热更发布（代码修复，分钟级下发）

适用：仅主进程/渲染层代码变化。**不适用**：设备驱动、SumatraPDF、内置页面、Electron 版本变化。

```bash
# 1. 构建 + 出发布物（--sync-version 把版本写回 package.json，保持内置基准对齐）
pnpm hotfix <app> --version <新版本> --sync-version

# 2. 打包冒烟（树外裸环境 + 热更闭环）
pnpm exec tsx scripts/e2e-packaged.ts <app> --hot

# 3. 上传（顺序不可颠倒）
#    先 dist/hotfix/core-<版本>.zip，后 dist/hotfix/asar-manifest.json
```

决策点：

- 热更代码**依赖新版设备驱动/内置页面能力**时，必须加
  `--min-resources-version <整包版本>`——旧 resources 设备自动跳过该热更，等整包先行。
- 版本必须严格大于线上所有已发布版本（客户端对 `<=` 直接忽略；同号重发无效）。
- 回滚 = 发布更高版本携带旧代码，客户端永不降级。

## 整包发布（安装器，resources / Electron 版本变化时必须）

```bash
# 1. 构建（typecheck + vite build + NSIS）
pnpm --filter @app/<app> build:win

# 2. 打包冒烟（自动断言：双 asar / app-update.yml / koffi 二进制 / 设备资源 / CJS 入口）
pnpm exec tsx scripts/e2e-packaged.ts <app>

# 3. 上传（顺序不可颠倒）
#    先 dist/<应用名>-Setup-<版本>.exe（+ .blockmap），后 dist/latest.yml
```

整包发布后，各设备的 asar 热更指针会在下一次启动时自动与内置版本对齐
（内置更新 → 陈旧热更自动清理，`launcher.log` 可见 `stale hot asar ... cleaned`）。

## kiosk 装机目录规范

kiosk / 无人值守设备统一**用户级目录**安装（默认 `%LocalAppData%\Programs`）。
装到 Program Files 则静默更新（`quitAndInstall`）需要 UAC 提权，无人值守场景会悬挂在提权弹窗。

## 发布后验证

- 任选一台设备触发检查（应用内更新入口或重启），确认：
  - 热更：`desktop-updater/pending.json` 出现 → 重启后 `launcher.log` 出现 `loaded hot core`
  - 整包：`logs/main.log` 出现 `update-downloaded` → 退出/定时重启后版本号前进
- 灰度建议：先发一台测试设备目录（feed 按设备分组目录即可实现灰度），观察后再全量。

## 常见发布事故速查

| 症状 | 原因 | 处置 |
|---|---|---|
| 客户端始终"已是最新" | 清单版本号未严格递增 / CDN 缓存旧清单 | 递增版本；清单 `Cache-Control: no-cache` |
| 热更下载后反复重新下载 | 清单版本含无法比较的段（历史 NaN bug 已修，老安装包需整包升级） | 换标准 `x.y.z` 版本 |
| 设备状态全部 offline | 整包未含 resources/devices（同步脚本未执行） | 重跑 `pnpm sync:resources` 后重打包；e2e 会拦 |
| 热更加载失败回退内置 | 看 `launcher.log` 的 `failed to load hot core` 原因 | 修复后发更高版本；客户端已自动回退无风险 |

## 平台契约与风险记录

- **所有服务必须容忍 `app.exit(0)` 硬退出**：真机实证 `app.exit(0)` 会触发 quit 事件且 exitCode=0，electron-updater 的 quit 处理器会借此执行静默安装——平台语义即"退出随时可能被更新接管"，任何服务不得假设每次退出都有完整优雅关闭流程。
- **关键状态写入即落盘**：更新器状态（`pending.json` / `current.json` / `first-run.json`）每次变更立即写盘；进程随时可能被硬杀，重启后以磁盘状态为准恢复。
- **重启路径择优**：应用内重启（定时重启 / 热更生效）先择优——整包已下载且新于生效版本时改走 `quitAndInstall(true, true)` 接管退出（静默安装 + 自拉起）；否则临时禁用 quit 安装（`autoInstallOnAppQuit = false`）再 relaunch，避免新实例已武装与安装器替换安装目录的竞态。
- **整包零回滚**：安装器不支持降级；高风险变更走热更（可回滚），整包发布前必须真机验证。

## 真机验证记录（2026-10-19，双通道更新优化）

对照 [update-improvement-plan.md](./update-improvement-plan.md) §7 清单逐项验证，环境：本地双通道验证服务器（JSON body 清单、可切场景）+ `Desktop-1.0.0-x64.exe` 真机。

| # | 清单项 | 结论 |
|---|---|---|
| ① | latest.yml JSON body 解析 | 通过：electron-updater 6.8.9 正常解析 JSON body 清单并触发下载，无解析错误 |
| ② | `path` 绝对 URL | 通过：绝对 URL 下载命中（106MB 安装器约 2s），blockmap 差量自动生效 |
| ③ | `/S --force-run` 静默安装 | 通过：assisted（`oneClick: false`）安装器静默装入 `%LocalAppData%\Programs\Desktop`（用户级，无 UAC）且装完自拉起；运行中再次静默安装会关闭旧实例并自拉起新实例；`LastInstallDir` 记忆目录跨安装/重装保持。首跑暴露 installer.nsh 既有 bug——`customInit` 无条件 `ReadRegStr $INSTDIR`，首次安装时键不存在，NSIS 会将 `$INSTDIR` 清空导致文件落盘根；已改为临时寄存器 + `${Errors}` 判断后重验通过 |
| ④ | `app.exit(0)` 触发 quit | 通过：探针实证 `quitFired: true, exitCode: 0`——T7 防御必要性实锤（electron-updater 的 quit 处理器此时会执行静默安装） |
| ⑤ | blocked 状态 | 通过：`minResourcesVersion` 不满足时推独立 `blocked` 状态、zip 即时清理、不落 pending；解除门槛后正常走下载 → pending 闭环 |
| ⑥ | T-Auth | 通过：配置 token 后清单 / blockmap / 安装器下载三请求均带 `x-api-key`；未配置不带头；热更通道鉴权独立走适配器 headers，两通道互不影响 |

热更闭环（T1 / T4 / T5 / T9 联动）：manifest 1.0.2 → 下载 → `pending.json` 落盘（下载即清孤儿 asar）→ 重启 `hot asar applied` + `loaded hot core` → `asar up to date: 1.0.2` 不再重复下载；加载成功 60s 后 `first-run.json` 被进程内计时器自动清除（判活不读墙钟，对时钟回拨免疫）。

T7：`resolveRelaunch` 择优逻辑由单测覆盖；分支 1 前提（quit 事件 + exitCode 0 触发安装器）由 ④ 实证；分支 2（无待装整包时直接 relaunch）在热更重启闭环中验证。

**部署纪律（T6 配套）**：kiosk 装机统一**用户级目录**（默认 `%LocalAppData%\Programs`）；装到 Program Files 则静默更新时 UAC 悬挂。
