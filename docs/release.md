# 发布手册

版本纪律与服务器接口契约见 [`update-server.md`](./update-server.md)；本文件是发布操作流程。

## 通用前置

1. `pnpm typecheck && pnpm lint && pnpm test` 全绿。
2. 确认 `pnpm-workspace.yaml` 版本变动已提交（catalog / 依赖变更影响所有应用）。
3. 设备驱动文件有更新时，确认改的是仓库根 `resources/devices/`（单一来源），并随**整包**发布。

## 热更发布（代码修复，分钟级下发）

适用：仅主进程/渲染层代码变化。**不适用**：设备驱动、SumatraPDF、内置页面、Electron 版本变化。

```bash
# 1. 构建 + 出发布物（--sync-version 把版本写回 package.json，保持内置基准对齐）
pnpm hotfix <app> --version <新版本> --sync-version

# 2. 打包冒烟（树外裸环境 + 热更闭环）
pnpm exec tsx scripts/e2e-packaged.ts <app> --hot

# 3. 上传（顺序不可颠倒）
#    先 dist/hotfix/core-<版本>.asar，后 dist/hotfix/asar-manifest.json
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
| 设备状态全部 offline | 整包未含 resources/devices（junction 断裂） | 重跑 `pnpm sync:resources` 后重打包；e2e 会拦 |
| 热更加载失败回退内置 | 看 `launcher.log` 的 `failed to load hot core` 原因 | 修复后发更高版本；客户端已自动回退无风险 |
