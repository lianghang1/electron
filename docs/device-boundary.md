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
| 干净 clone 全链路 | `pnpm verify` 12 阶段全绿，构建后无中间 `dist` |
| Linux 打包 | `pnpm build:linux` 产出 AppImage + deb |
| Windows 打包 | `pnpm build:win` 产出 win-unpacked（交叉打包） |
| UI 渲染 | 六张 Playwright 实机渲染截图（platform/solo/命令面板/设置/深色）人工核对 |

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
- **系统权限请求**：`setPermissionRequestHandler` 当前恒拒绝（fail-closed 基线），与 `PermissionService` 策略表的统一接线未完成。

### 更新服务端

- `UpdateManifest` 由服务端下发，需要真实服务端提供含 `package.artifacts`（按 `BuildPlatform` 分组）的清单做端到端演练。
- 恶意 zip / 畸形清单 / 非白名单源站已由单测与 e2e 覆盖对抗逻辑，但真实网络环境下的下载中断续传需真机复验。

### 本地扩展应用（apps.json）

- **信任边界**：`<配置目录>/apps.json` 与 flavor 内置清单同构，且同为受信任部署输入——能写该文件即可注册应用并声明 `devices` / `permissions`，权限策略表按其声明放行。配置目录写权限必须由部署侧管控；现场免重打包只增加应用清单，不替换打包资源。
- **真机待验**：已部署环境丢入 apps.json 后重启生效、与内置应用重名时的跳过告警、kiosk 形态下扩展应用的直达配置。

## 已知未完成（不冒充完成）

| 项 | 状态 |
| --- | --- |
| `PermissionPrompt` 渲染层浮层 | SPI 就绪，UI 入口未接 |
| `domain-call` 调用方身份 | `ctx.appId` 恒为 `shell`，需从 sender 提取真实身份 |
| `DomainMethodDef.grant` 接线 | 契约已声明，未与 `PermissionService` 贯通 |
| IPP 打印通道 | 显式不可用扩展点 |
| CaptureDialogSession → OverlayHost | 服务与 `#/overlay` 挂载入口均无消费方 |

## 验证纪律

1. 沙箱结论只引用退出码与产物路径，不写「应该没问题」。
2. 真机条目验证后回填本文，附环境（Windows 版本、Electron 版本、驱动型号）。
3. 未验证条目保持列出，不允许删除来「清零」。
