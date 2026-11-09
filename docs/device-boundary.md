# 真机验证边界

沙箱能证明的与只有真机能证明的，分开写清楚。凡本文标注「真机」的条目，未经真机确认不得宣称已验证。

## 沙箱已机器验证（可复现退出码）

| 项 | 证据 |
| --- | --- |
| 工程/设计护栏零容忍 | `pnpm guard`、`pnpm check:design`、`pnpm check:design:css` 退出码 0 |
| 类型与单测 | `pnpm typecheck`、`pnpm test`（shared 14、devices 62） |
| 更新链路 e2e | `pnpm test:e2e:update` 15/15，含命令注入对抗用例 |
| 浮层宿主 e2e | `pnpm test:e2e:overlay` 9/9 |
| 权限模型 e2e | `pnpm test:e2e:permission` 10/10 |
| apps.json 本地应用源 | `pnpm test:e2e:apps-source` 8/8，规则表经生产函数 `buildAppPermissionRules()` 验证 |
| 应用会话 / 下载 / 审计 | `pnpm test:e2e:session` 11/11（纯策略 + 真实 `AuditLog` 落盘：白名单、退订、过期清理） |
| 身份与权限闭环 | `pnpm test:e2e:caller` 10/10（调用方反查、grant 贯通、系统权限映射、真实策略链路） |
| 调试台清单与接线防漂移 | `pnpm test:e2e:diagnostics` 13/13（清单 ↔ 真实域定义双向比对、默认入参跑 zod schema、flavor 隔离与路由注册） |
| 干净 clone 全链路 | `pnpm verify` 全阶段全绿（含 `dev:diagnostics` 启动解析），构建后无中间 `dist` |
| Linux 打包 | `pnpm build:linux` 产出 AppImage + deb |
| Windows 打包 | `pnpm build:win` 产出 win-unpacked（交叉打包） |
| UI 渲染 | 十一张 Playwright 实机渲染截图（platform/solo/命令面板/设置/深色/下载横幅/应用数据 + 调试台硬件页/平台自检/深色），人工核对无白屏与控制台错误 |

## 调试台（验机形态）

独立 `diagnostics` flavor（`apps/flavors/diagnostics/flavor.json`）：`mode: desktop`、`chrome: platform`、`defaultAppId: diagnostics`、`diagnostics: true`。启动后直达调试台，生产 flavor 不受影响。

- **开发**：`pnpm dev:diagnostics`，`--flavor=diagnostics` 经 electron-vite 传入主进程 `loadFlavor()`。
- **打包**：`FLAVOR=diagnostics pnpm build:win`（Windows PowerShell 用 `$env:FLAVOR='diagnostics'; pnpm build:win`），`extraResources` 注入 `resources/flavor.json`；不设 FLAVOR 默认仍是 `cemetery`。
- **覆盖**：硬件 6 页（拍摄 / 身份证 / IC 卡 / 签名 / 扫码 / 打印）共 38 个真实域方法，全部由 `DIAGNOSTIC_CATALOG` 声明式驱动，表单字段、只读/破坏性/流式标记、能力矩阵灰置共用一份数据；平台自检 8 项（运行环境、应用清单、设置快照、下载任务、网页存储、网络请求、未注册域预期拒绝、非法入参预期拒绝）。
- **能力矩阵**：`shell:info().capabilities.availableDomains` 决定各域是否可用，未启用域的调用在路由层即被拒绝，UI 同步禁用并提示。
- **事件流**：常驻单例面板订阅 `capture.frame` / `scanner.scanned` / `signature.stroke`，跨页保留历史。这三个流式方法的 `invoke` 只返回 ack，没有事件面板就看不到输出。
- **验机隔离**：`FlavorManifest.diagnostics` 只放行诊断专用方法（如 `scanner.simulate`），其余 flavor 一律禁用，与打包状态无关——现场验机跑的就是打包产物。

沙箱证据：`pnpm test:e2e:diagnostics` 13/13；`pnpm verify` 的 `dev:diagnostics` 阶段验证入口可解析；3 张调试台实机渲染截图。

真机边界：38 个方法的**返回值**全部依赖现场硬件与厂商 DLL（读卡器、高拍仪、签名板、扫码枪、打印机）。沙箱只证明表单能构造合法入参、调用能到达路由层、结果能渲染，不证明设备真的响应。现场需按 6 页逐项执行并记录返回值。

## 必须真机确认

### Windows

- **asar 文件锁**：运行中替换 `app.asar`，Windows 会锁文件。asar-hot 已设计 `.bak` 回滚与 `finalizeAsarUpdate()` 状态机，但文件锁的实际表现、杀进程后 `.bak` 恢复路径，只有真机能验证。
- **sandbox:true + CJS preload**：`ERR_UNSUPPORTED_ESM_URL_SCHEME (d:)` 已由 `externalizeDeps:false` + preload `.cjs` 修复，需在真实 Windows 盘符路径（`D:\...`）下启动确认。
- **厂商 DLL**：`resources/devices/` 下的驱动 DLL 真实加载、Winspool 枚举、SumatraPDF 打印路径。
- **kiosk 崩溃时序**：kiosk 应用崩溃 + 单实例锁（`second-instance` 聚焦）的竞争时序。
- **整包更新落地**：NSIS/安装器执行 `Win32Installer` 内建命令，退出安装、重启后生效。

### Linux

- **AppImage 更新**：`LinuxInstaller({ appImageTarget })` 注入的本地目标路径，真机上 cp 覆盖正在运行的 AppImage。
- **deb 安装**：`pkexec dpkg -i` 的授权弹窗与失败回滚。
- **CUPS 打印**：真实打印机枚举与 IPP 通道（当前显式 `CHANNEL_UNAVAILABLE`，属已知未实现）。

### 权限与浮层（三平台通用）

- **授权浮层 UI**：`PermissionPrompt` SPI 已建，但组合根尚未注入渲染层实现——真人点击「允许/拒绝」的完整闭环未验证。
- **`app://` origin 归一化**：packaged 应用的真实 origin 与 `matchesOrigin()` 白名单匹配。
- **系统权限请求真机表现**：`setPermissionRequestHandler` 已与 `PermissionService` 策略表统一（见「已闭合」），但 Chromium 在真实站点发起 `media` / `geolocation` 等请求时，映射结果与放行链路只有真机能确认。

### 更新服务端

- `UpdateManifest` 由服务端下发，需要真实服务端提供含 `package.artifacts`（按 `BuildPlatform` 分组）的清单做端到端演练。
- 恶意 zip / 畸形清单 / 非白名单源站已由单测与 e2e 覆盖对抗逻辑，但真实网络环境下的下载中断续传需真机复验。

### 本地扩展应用（apps.json）

- **信任边界**：`<配置目录>/apps.json` 与 flavor 内置清单同构，且同为受信任部署输入——能写该文件即可注册应用并声明 `devices` / `permissions`，权限策略表按其声明放行。配置目录写权限必须由部署侧管控；现场免重打包只增加应用清单，不替换打包资源。
- **真机待验**：已部署环境丢入 apps.json 后重启生效、与内置应用重名时的跳过告警、kiosk 形态下扩展应用的直达配置。

### 应用会话与下载（三平台通用）

- **cookie 快照退出时序**：`will-quit` 阻止退出 → 落盘 → 再次 `quit` 的可靠性，以及会话 cookie 跨重启是否真的保住登录态，只有真机能确认。
- **分区清理的影响面**：`clearCache` 与 `clearSiteData` 对真实站点登录态的作用，清空后旧快照是否确实不复活。
- **下载门控真实链路**：真实网络下 `will-download` 的进度/中断、拒绝后部分文件清理，以及 `shell.openPath` / `showItemInFolder` 的系统关联。
- **审计落盘**：`userData/platform/logs/audit/` 的写入权限、跨天分文件与 30 天保留清理，在真实部署环境的行为。
- **协议分区**：packaged 应用改用 `persist:app-<id>` 分区后，组合根为该分区注册的 `app://` 是否真实生效（沙箱只证明代码接线与构建通过）。

## 已知未完成（不冒充完成）

| 项 | 状态 |
| --- | --- |
| `PermissionPrompt` 渲染层浮层 | SPI 就绪，UI 入口未接 |
| IPP 打印通道 | 显式不可用扩展点 |
| CaptureDialogSession → OverlayHost | 服务与 `#/overlay` 挂载入口均无消费方 |

## 已闭合（曾列为未完成）

| 项 | 闭合方式 | 证据 |
| --- | --- | --- |
| `domain-call` 调用方身份恒为 `shell` | `CallerRegistry` 由窗口/视图/浮层创建时登记 `webContents.id → appId`，`domain-call`/`jsapi:call` 从 sender 反查，未登记即拒绝 | `pnpm test:e2e:caller` |
| `DomainMethodDef.grant` 未贯通 | 路由层统一按 `grant`（缺省推导 `domain.<域>`）调 `PermissionService.decide`，与 `buildAppPermissionRules` 同源 | `pnpm test:e2e:caller` |
| 系统权限请求与策略表未统一 | `setPermissionRequestHandler` 经 `sessionToPlatformPermission` 映射后走同一张策略表，不再恒拒 | `pnpm test:e2e:caller` |

## 验证纪律

1. 沙箱结论只引用退出码与产物路径，不写「应该没问题」。
2. 真机条目验证后回填本文，附环境（Windows 版本、Electron 版本、驱动型号）。
3. 未验证条目保持列出，不允许删除来「清零」。
