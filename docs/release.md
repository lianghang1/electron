# 构建与发布

## 六端目标矩阵

构建目标（BuildPlatform × arch）与硬件能力平台（Platform，含国产化细分）不是同一维度，勿混用。矩阵依据 ZCode `docs/desktop/oss-cdn-multi-target-migration.md` 的 `update/<platform>/<arch>` 契约。

| 构建目标 | 架构 | 对应设备 | 产物 |
|---|---|---|---|
| `win32` | `x64` | 常规 PC、兆芯 / 海光（x86 路线） | NSIS |
| `win32` | `arm64` | Windows ARM64 设备 | NSIS |
| `darwin` | `x64` | Intel Mac | dmg |
| `darwin` | `arm64` | Apple Silicon | dmg |
| `linux` | `x64` | 常规 x86 终端、兆芯 / 海光 | deb + AppImage（+ 可选 rpm） |
| `linux` | `arm64` | 飞腾 / 鲲鹏 | deb + AppImage（+ 可选 rpm） |

**龙芯、申威无 Electron 官方二进制，不在矩阵内。** 国产化 CPU 按指令集落到 `linux-x64` / `linux-arm64`，驱动差异由平台能力表（`packages/devices/src/domains/platform/`）处理，不新增构建目标。

`electron-builder.config.mjs` 中的 `BUILD_MATRIX` 是机器可验的约束：`TARGET_OS` 缺省取 `process.platform`，`TARGET_ARCH` 缺省取 `process.arch`，非法组合直接抛错，不静默产出错误架构的包。

## 逐端构建

Linux 双架构可在任意机器交叉产出；macOS 公证与 Windows NSIS 需要对应平台工具链（见下）在 Linux 上不等价：

```bash
FLAVOR=cemetery pnpm build:win                       # win32 / x64
FLAVOR=cemetery TARGET_ARCH=arm64 pnpm build:win    # win32 / arm64
FLAVOR=cemetery pnpm build:mac                      # darwin / x64
FLAVOR=cemetery TARGET_ARCH=arm64 pnpm build:mac    # darwin / arm64
FLAVOR=cemetery pnpm build:linux                    # linux / x64
FLAVOR=cemetery TARGET_ARCH=arm64 pnpm build:linux  # linux / arm64
FLAVOR=cemetery TARGET_RPM=1 pnpm build:linux       # 追加 rpm（需 rpmbuild）
```

产物名 `<flavor>-<version>-<os>-<arch>.<ext>`，输出目录 `release/<flavor>/`。带平台与架构信息后，同一版本六端产物不会互相覆盖，也便于按 ZCode 契约组织 `update/<platform>/<arch>/` 目录。

打包链路：`pnpm run build`（typecheck + electron-vite 构建）→ `electron-builder --config electron-builder.config.mjs`。CI 已删除，逐端产物由人工核对。

## 拆包结构

`scripts/after-pack.cjs` 把 electron-builder 的完整产物拆成两层：

```
resources/app.asar                     薄壳引导器（KB 级，永不热更）
resources/app.core.asar                完整 out/ 布局（内置版本基线）
resources/resources/.resources-version 内置 resources 版本基准
resources/node_modules/koffi           原生依赖，随整包落地
resources/flavor.json                  产品形态
resources/apps/                        内置应用 dist
resources/devices/                     驱动资产
```

引导器落在 `app.asar/out/main/index.js`（electron-builder 完整性校验按项目 `main` 检查此路径），以 ESM 在 `app.ready` 前加载 `app.core.asar` 并把 `artifactRoot` 显式注入组合根。热更包只替换 core asar，**禁止携带 `.node`**；koffi 与 resources 版本基准只能随整包更新。

## 签名、公证与仓库签名

当前打包配置**未启用**以下能力，发布前须按平台补齐，配置不假装已具备：

| 平台 | 待补项 |
|---|---|
| Windows | Authenticode 代码签名证书（NSIS 安装包与可执行文件） |
| macOS | Developer ID 签名 + 公证（notarize），arm64 与 x64 均需 |
| Linux | deb / rpm 仓库 GPG 签名与 AppImage 校验发布 |

更新链路自身的安全边界是 `HTTPS + origin 白名单 + sha256 强校验`，**不引入公钥签名**。

## 更新清单发布

整包产物上传后，把各平台地址与 sha256 写进单份 `UpdateManifest` 的 `package.artifacts`；热更包与 dist 应用包同清单下发。契约、校验规则与判活机制见 [update-server.md](./update-server.md)。强制更新门禁用 `minVersion`，低于该版本的设备被阻断并展示门禁页。

## 真机验证清单

| 项 | Linux x64 | Linux arm64 | Windows x64/arm64 | macOS x64/arm64 |
|---|---|---|---|---|
| 干净 clone `pnpm verify` | 已通过（19 阶段） | 同一份源码，逻辑层不随架构分叉 | 待真机 | 待真机 |
| 打包产物生成 | 已通过（deb + AppImage） | 已通过（deb + AppImage） | 已通过（NSIS，wine 交叉产出） | 已通过（zip，交叉产出；dmg 需 mac 端） |
| 产物架构校验 | 实装成功 | `Architecture: arm64` 已验 | PE 产物生成，真机安装待验 | Mach-O cputype 双架构已验 |
| deb 包名 / 依赖元数据 | 已通过（实装 `dpkg -i` 成功） | 已通过（`Package: cemetery`） | — | — |
| 引导层加载 core asar 并启动 | 已通过（安装目录实包，`launcher.log` 为证） | 同一引导代码路径 | 待真机 | 待真机 |
| 整包安装与退出交接 | 已通过（`graceful-exit.json` 落盘） | 同一引导代码路径 | 待真机 | 待真机 |
| 厂商 DLL / 驱动调用 | 不在沙箱范围 | 待真机 | 待真机 | 待真机 |
| 原生浮层遮挡与焦点 | 逻辑 e2e 已覆盖 | 待真机 | 待真机 | 待真机 |
| 热更指针切换 + 60s 判活回滚 | e2e 已覆盖 | e2e 已覆盖 | e2e 已覆盖 | e2e 已覆盖 |
| 签名 / 公证 / GPG | 未启用 | 未启用 | 未签名（signtool 无证书直通） | 未签名 |

六端产物均可在本仓库工具链产出：Linux 双架构原生；Windows NSIS 依赖 `wine`（含 32 位前缀，`wineboot --init` 需先建好，Ubuntu 上补 `wine32:i386`）；macOS zip 直接交叉，dmg 必须回到 mac 端（`hdiutil`）。

交叉打包实证中修复的缺陷（都来自真实构建，不是猜测）：

- deb/rpm `Package` 字段曾用中文产品名，Debian 要求以字母数字开头导致 `dpkg -i` 拒装，已改用 `flavor.id`。
- `electron-builder --linux deb` 显式指定 target 名会丢弃配置 arch 数组，交叉打包必须同时传 `--arm64`。
- `after-pack.cjs` 曾按 Linux/Windows 布局取 `appOutDir/resources`，macOS 真机打包会因 `<App>.app/Contents/Resources` 布局直接 ENOENT，已按平台分支。
- macOS 交叉打包要求 `ELECTRON_MIRROR` 或镜像缓存：GitHub 直连下载损坏（重试拼接出 31MB 残留导致 `MacOS/Electron` 丢失），已改镜像并做 `SHASUMS256` 校验。

仍需真机/证书的部分（不冒充）：Windows/macOS 系统级启动冒烟与安装体验、厂商 DLL、浮层视觉遮挡、签名/公证/GPG。

## 明确不做

CI 流程、龙芯 / 申威目标、旧三套业务 apps、`master` 的 CJS 引导器代码（只借结构）、公钥签名，以及旧方案中自造的中间抽象命名。
