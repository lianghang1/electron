# 部署说明

## 产品形态（Flavor）

一套壳对应多个产品，差异全部落在 `apps/flavors/<id>/flavor.json`，代码零分支。打包态由 `extraResources` 注入 `<resources>/flavor.json`；开发态用 `--flavor=<id>` 指定，缺省 `cemetery`。

| 字段 | 说明 |
|---|---|
| `id` / `name` | 形态标识与显示名（`id` 同时决定 `appId` 与可执行文件名） |
| `mode` | `desktop`（托盘工作台）或 `kiosk`（全屏锁定 + 看门狗） |
| `chrome` | `platform`（工作台壳）/ `solo`（容器隐形，应用直出） |
| `apps` / `defaultAppId` | 内置应用清单与启动直达目标 |
| `branding.accent` | 主色，经启动参数同步注入 preload，首帧零闪烁 |
| `update.manifestUrl` / `update.allowedOrigins` | 更新清单地址与源站白名单 |
| `diagnostics` | 验机形态标记：开启硬件自检台与诊断方法 |
| `resilience` | 崩溃重载 / 开机自启 / 退出守卫 / 定时重启，逐项默认关闭 |

`solo` 档必须配 `defaultAppId` 或直出应用，否则窗口无内容可铺。`kiosk` 形态不创建托盘，避免现场出现逃逸入口。

## 应用注册

除 flavor 内置应用外，可在 `userData/platform/storage/apps.json` 注册外部应用；内置 id 优先，外部清单无法覆盖。可写配置目录即能注册应用并声明权限，因此**目录写权限必须由部署侧管控**。

三种入口形态：

| 形态 | 说明 |
|---|---|
| `embedded` | Vue 组件直接渲染进工作台，无独立 webContents |
| `packaged` | `resources/apps/<appId>/` 的本地 dist，经 `app://` 协议加载 |
| `remote` | 远端页面 + JSAPI 受控桥，按 `origins` 白名单与账本身份双重校验 |

非 embedded 应用各自持有 `persist:app-<id>` 分区会话（含 cookie 快照），缓存清理与站点数据清理彼此隔离。

## 权限模型

- 策略表由 flavor / apps.json 声明生成：**清单声明即放行，未声明一律拒绝**（fail-closed）。
- 域方法、系统权限（摄像头/剪贴板等）、下载门控、JSAPI 调用共用同一张策略表；调用方身份从 `CallerRegistry` 按 webContents 反查，页面无法伪造 `appId`。
- 运行时授权：应用可经 `permissions.request()` 主动请求，走原生浮层询问，结论持久化到平台 KV，同一权限不反复打扰；无人值守形态 30s 超时按拒绝收敛。
- 工作台可查询权限状态、重置运行时授权；`permissions.query()` 只做展示，不触发弹窗。

## 数据目录

平台自管数据统一收敛在 `userData/platform/`，与 Chromium 引擎自管内容（Partitions / Cache / Crashpad）隔离。启动时执行幂等的旧布局迁移。

| 路径 | 内容 |
|---|---|
| `platform/storage/` | 设置、apps.json、打印任务簿、`app-<appId>.json` 应用隔离 KV |
| `platform/logs/` | 运行日志与 `logs/audit/` 审计日志 |
| `platform/cookies/` | 各应用 cookie 快照 |
| `platform/files/capture\|print\|signature/` | 业务产物（7 天保留期，由注册制清理器统一处理） |
| `userData/desktop-updater/` | **唯一例外**：asar 热更指针与核心包，是引导器跨版本契约目录，不可改名 |
| `userData/desktop-updater/apps/` | dist 热更产物与 `apps-current.json` 指针 |

审计日志保留 30 天，业务产物 7 天；生产者只注册目录与保留期，清理器不认识业务名。

## 驱动资产

构建期由 `scripts/prepare-driver-assets.mjs` 把源码树资产聚合为 `resources/devices/<域>/<厂商>/<平台>/<文件>`，与域内声明一一对应。

- `bundled` 部署：资产随整包落 `resources/devices/`，系统部署（mac/Linux）不携带 DLL。
- `manual` 部署：信创现场把厂商 SDK 放到 `userData/platform/resources/`，寻址规则相同。

koffi 原生依赖随整包落 `resources/node_modules/`，**热更包禁止携带 `.node`**。详见 [driver-packaging.md](./driver-packaging.md)。

## 更新开关

`flavor.update.manifestUrl` 为空则不注册任何更新通道。`allowedOrigins` 为空数组时所有更新 URL 一律拒绝（fail-closed），必须显式声明源站（支持 `*.example.com` 通配）。清单契约见 [update-server.md](./update-server.md)。

## 验机形态

`diagnostics: true` 的形态启动硬件自检台：设备连接、平台能力矩阵、驱动寻址、IPC 调用均可人工触发，是现场排障入口而非调试开关。调试台方法名只从 `DIAGNOSTIC_CATALOG` 取，e2e 双向比对其与真实域定义。
