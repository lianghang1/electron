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

在**对应操作系统的机器**上执行（macOS 公证与 Windows NSIS 无法在 Linux 上等价完成）：

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

| 项 | Linux x64（沙箱） | Windows x64/arm64 | macOS x64/arm64 | Linux arm64（飞腾/鲲鹏） |
|---|---|---|---|---|
| 干净 clone `pnpm verify` | 已通过 | 待真机 | 待真机 | 待真机 |
| 打包产物生成 | 已通过（deb + AppImage） | 待真机 | 待真机 | 待真机 |
| 引导层加载 core asar 并启动 | 已通过（实包） | 待真机 | 待真机 | 待真机 |
| 厂商 DLL / 驱动调用 | 不在沙箱范围 | 待真机 | 待真机 | 待真机 |
| 原生浮层遮挡与焦点 | 逻辑 e2e 已覆盖 | 待真机 | 待真机 | 待真机 |
| 整包安装与退出交接 | 未验证 | 待真机 | 待真机 | 待真机 |
| 热更指针切换 + 60s 判活回滚 | e2e 已覆盖 | 待真机 | 待真机 | 待真机 |
| 签名 / 公证 / GPG | 未启用 | 发布前补齐 | 发布前补齐 | 发布前补齐 |

沙箱结论只覆盖 Linux x64 打包与启动链路、以及全部纯逻辑 e2e；其余一律记为真机待验，不冒充已完成。

## 明确不做

CI 流程、龙芯 / 申威目标、旧三套业务 apps、`master` 的 CJS 引导器代码（只借结构）、公钥签名，以及旧方案中自造的中间抽象命名。
