# Desktop Platform 路线图与进度

> 本文档是项目的**进度唯一事实源**：每完成 / 启动一个事项，必须同步更新本文档状态，避免上下文丢失。
> 架构与需求背景见 [prd.md](../prd.md)，工程硬约束见项目记忆（project_memory.md）。

## 项目定位

类飞书的多应用 Desktop Platform：Electron 平台壳（Shell）承载多个 Web 应用 Tab，
核心能力（窗口 / 安全 / 权限 / Session / Storage / 日志 / IPC 契约）沉淀在 `@desktop/core`，
支持多形态 App（Desktop Shell / Kiosk 自助机 / …）。

## 状态图例

- ✅ 已完成
- 🔨 进行中
- ⬜ 待办
- ⛔ 明确不做 / 已裁剪（含决策原因）

## 一、已完成里程碑

| 事项 | 状态 | 说明 |
| --- | --- | --- |
| Workspace + 平台核心 | ✅ | @desktop/shared / core / config / vite-config，apps/desktop Shell、apps/kiosk 形态 |
| IPC 契约（全自研） | ✅ | DesktopIpc type alias 双形态（invoke / 推送），Main 侧 handle 包装 + preload 裸 invoke |
| 安全基线 | ✅ | sandbox / contextIsolation 等写死不可配；导航防护、弹窗拦截、权限默认全拒 |
| manifest.permissions ↔ Session guard | ✅ | 平台权限映射 Chromium session 权限（clipboard/notification），App 间端到端隔离已验证 |
| 权限运行时授权闭环 | ✅ | Main 推送 → Shell 决策 → 回传；inflight 去重、会话缓存、30s 超时拒绝、tab:closed 撤销 |
| 权限授权 UI（终稿） | ✅ | 底部通知横幅（flex 布局成员，viewport 自动收缩让位，顶部内容零移动） |
| Tab 防重复打开 | ✅ | 同 App 已开 Tab 时 open = 激活既有 Tab |
| 日志体系 | ✅ | electron-log：文件轮转、崩溃捕获（main/renderer/child-process）、renderer 控制台桥接（scope 按源 App 标注） |
| Storage / Session | ✅ | electron-store 每 App 独立文件；persist:app-<appId> 会话隔离 |
| 测试 App | ✅ | CRM / OA 本地测试页（加载计数器验证持久化隔离、剪贴板/通知按钮验证权限差异） |
| 最终验收链 | ✅ | typecheck / lint / build / dev 冒烟全绿；安装包产出与生产版启动已验证 |

## 二、进行中 / 下一步

| # | 事项 | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | AppRegistry 多源注册 | ✅ | 代码注册（保底优先）+ `<userData>/apps.json` 本地文件源（含结构校验、冲突跳过）+ apps.remoteUrl 远程 URL 源（#12） |
| 2 | core 组装可选化 | ✅ | `features.tabs` 开关：关闭后 Tab/App/Web 服务不实例化、tabs:* 通道不注册；kiosk 已启用 |
| 3 | storage:clear 通道 | ✅ | 契约 + Main 注册 + preload + DesktopApi 全链路补齐 |
| 4 | 打包分发验证 | ✅ | Desktop-1.0.0-x64.exe（93.8MB）产出 + win-unpacked 生产版启动验证通过。前置条件见下方「打包备注」；icon.ico 已由脚本生成 |
| 5 | 多窗口支持 | ✅ | window.open 按 manifest.allowedOrigins 放行 → 平台受管弹窗（parent 绑定、Session/身份继承、弹窗内再开窗递归受管），外部 URL 仍转系统浏览器 |
| 6 | 下载管理 | ✅ | will-download 校验 download 权限（未声明即取消），默认存系统下载目录，进度 500ms 节流推送 Shell 底部下载横幅 |
| 7 | 通知桥接 | ✅ | 运行时权限决策持久化（userData/platform-permissions.json，重启不重复询问）+ permission:list 管理面通道（声明/授权合成视图） |
| 8 | 自动更新 | ✅ | electron-updater generic provider，由 config.updates.url 驱动（未配置即关闭），dev 模式跳过；状态推送 Shell 更新横幅 |
| 9 | asar 热更新（B 方案） | ✅ | 引导器 asar 架构（见打包备注）：热更包 core-\<version\>.asar 下载即终名 + current.json 指针切换（零 rename 零文件锁）；替换后首启 <60s 判活失败自动回滚内置包（防变砖），稳定后自动清理旧热更包；状态推送 Shell 更新横幅（update:asarState），update:install 统一入口 pending 优先。生产链路 apply / hot 加载 / 回滚 / 稳定清理已全部验证 |
| 10 | Kiosk 运行韧性 | ✅ | core/src/resilience：crashReload（渲染崩溃指数退避重载 1s→30s，60s 内 >5 次熔断告警）、autoLaunch（系统登录项，dev 跳过、显式 false 移除）、exitGuard（拦截用户关窗，app.quit() 放行）；渲染进程实杀验证通过 |
| 11 | Audit Log | ✅ | core/src/audit：权限决策 / 崩溃 / App 生命周期 JSONL 按天落盘（userData/audit/，保留 30 天自动清理），同步写保证退出前落盘、失败只告警；渲染进程实杀验证通过（kiosk + desktop 双形态） |
| 12 | 应用中心远程源 | ✅ | apps.remoteUrl 异步拉取 DesktopAppManifest 数组（超时 10s、失败静默跳过不拖垮启动），结构校验与本地源同一标准，代码注册优先；本地服务器联调通过 |
| 13 | 应用中心 UI | ✅ | Shell 左侧推开式面板（flex 成员让位，Web 容器经 ResizeObserver 自动跟随）：App 卡片（名称/版本/来源 内置·本地·远程/类型）、运行状态点（tabs:updated 联动）、点击打开（防重复）、卡片展开权限详情（permission.list 声明+授权合成视图）；配套 app:list 契约升级为 RegisteredApp（manifest + source），AppRegistry 记录注册来源 |
| 14 | Shell UI 视觉精修（飞书感） | ✅ | titleBarStyle: hidden 去掉系统标题栏（自绘窗口控制唯一入口，backgroundColor 防闪白）；标题栏与 TabBar 合并 40px 沉浸顶栏（品牌+应用中心入口 / Tab / 窗口控制三段式，整栏 -webkit-app-region: drag 拖拽区、控件 no-drag，顺带修复整窗不可拖动）；左侧栏 168px 文字列表 → 68px 飞书式图标导航（图标上文字下，激活项随 Tab 蓝色高亮）；主色统一飞书蓝 #3370ff（横幅/按钮/进度条/图标方块），hover 灰 #f2f3f5 |

### 打包备注（Windows）

- 前置环境变量：`ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`（工具链下载）；`ELECTRON_BUILDER_CACHE=<项目内目录>`（本机受控环境写不了 %LOCALAPPDATA% 时重定向）
- 配置唯一来源：apps/desktop/electron-builder.yml（package.json 的 "build" 字段会覆盖 yml，已删除，勿再加回）
- asar 热更引导器：afterPack（scripts/after-pack.cjs）先把 electron-builder 产物 app.asar 改名为 app.core.asar，再把 build/launcher 打包为 KB 级 app.asar；launcher 的 package.json name 必须是正式应用名（决定 userData 路径），main 与真实包一致指向 out/main/index.js（过 electron-builder 完整性检查）
- build/icon.ico 由 scripts/generate-icon.mjs 纯 Node 生成（蓝色圆角方块 + 白色四宫格，多尺寸内嵌 PNG），改图标重跑脚本即可
- 更新 / 远程源联调开关（环境变量，不设置即生产默认）：`DESKTOP_UPDATE_FEED`（updates.url，asar 清单相对其解析）+ `DESKTOP_APPS_REMOTE`（apps.remoteUrl）；配套 scripts/update-test-server.mjs 本地 feed（asar 清单 + latest.yml 占位 + 远程 registry）
- 产物自包含：electron-vite build 把 workspace 包全部 bundle 进 out/main（无 bare import），无需打包 node_modules 里的 workspace 链接；original-fs（Electron 内置）已在 vite-config main external 显式声明

## 三、后续方向与裁剪决策（2026-09-25 定位评审）

> 定位结论：内部平台壳 / 工具底座，非对外超级应用。企业级生态体系整体裁剪，以按需迭代为主。

**按需迭代（有真实诉求再做）**

- 平台能力扩展（JSSDK 式）：按业务需要逐步向 Web App 暴露平台能力，每项配权限词汇表条目，走现有 IPC 契约模式
- 应用中心小改：搜索 / 分类 / 直装远程 App（需 App 级分发通道）
- App 接入文档：manifest 编写 + 权限模型说明（有团队接入时再写）

**⛔ 明确不做（含决策原因）**

- SSO / 组织架构 / RBAC — 内部工具无身份源诉求
- CI/CD 发布流水线 — 打包脚本已齐（见打包备注），小团队手动发版够用
- 插件系统、应用签名 / PKI — 对外生态分发才需要
- Crash 远程上报、性能 / 内存监控 — 无运维体系收数据，本地 electron-log + Audit Log（#11）已覆盖
- Playwright E2E — 功能面已冻结，出现高频回归再针对性补

**待设计决策**

- （无——Shell UI 视觉精修已完成，见 #14）

## 四、关键决策记录（勿回退）

| 决策 | 原因 |
| --- | --- |
| IPC 全自研，不用 typed-ipc | 其契约提取机制与我们的契约形态冲突；renderer 依赖 electronAPI 全量暴露违背最小桥原则 |
| Web 容器用 WebContentsView，不换 iframe | 保留进程 + partition 硬隔离；代价是 Shell DOM 弹窗盖不住 Tab 区，全局弹窗采用「底部横幅 + flex 让位」折中（已终稿） |
| preload 必须 CJS | sandbox:true 与 ESM preload 不兼容 |
| Storage 用 electron-store ^10 | 每 App 独立文件 userData/app-<appId>.json；main 输出 ESM 故可用 v10 |
| 格式化统一 antfu eslint（lint:fix） | Prettier 与 antfu 规则冲突（79 个报错验证），已移除 Prettier，勿再引入 |
| Playground 已移除 | 用户决定；测试职责由 CRM/OA 本地测试页承担 |
| 进程级安全基线不进 DesktopConfig | core 写死不可配，防误配 |
| asar 热更采用版本化文件名 + current.json 指针切换（不做 rename） | 运行中进程锁 .asar 文件，rename 实测 EBUSY 重试无解；core-\<version\>.asar 下载即终名，apply 只写指针文件，零锁冲突 |
| .asar 文件的删除 / 写入 / 直读必须用 original-fs | Electron 把 *.asar 后缀路径代理为 asar 虚拟文件系统：fs.rmSync 报 ERR_FS_EISDIR，createWriteStream / createReadStream 报 Invalid package；引导器（删除）与 AsarUpdateService（下载落盘 / sha256 直读 / 清理）全部走 original-fs |

## 五、维护约定

1. 每完成 / 启动「进行中」表中的一条：更新状态与说明，必要时在「已完成里程碑」补一行
2. 新增决策 → 「关键决策记录」加一行 + 同步 project_memory.md
3. 事项做完后从「进行中」表移除，保持该表只反映当下
