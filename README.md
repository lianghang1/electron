# 壳平台 v2

一套 Electron 壳 × N 个产品形态（Flavor）。`next` 分支是 v2 颠覆性重构：不是给旧代码打补丁，而是重新梳理边界——九包 monorepo、组合根唯一组装、SPI 策略表、依赖单向、workspace 源码直引（无逐包构建）。

项目尚未投产。`master` 分支与 ZCode 仓库是一等参考源：功能行为、平台差异、边界条件以源码为准。工程约定见根目录 [`AGENTS.md`](./AGENTS.md)，界面约定见 [`DESIGN.md`](./DESIGN.md)。

## 分层

| 层 | 包 | 职责 |
|---|---|---|
| 契约 | `@shell/shared` | 事件表、域签名、Flavor schema、权限映射、安全函数 |
| 内核 | `@shell/kernel` | 生命周期、事件总线、日志、审计、下载、会话、设置、存储、消息通知、应用 KV、过期清理 |
| 设备域 | `@shell/devices` | 身份卡 / IC 卡 / 打印 / 扫码 / 拍摄 / 签名域、驱动寻址、守护进程、平台能力表 |
| 应用运行时 | `@shell/app-runtime` | 应用清单、三种打开策略、权限策略、`app://` 协议 |
| 更新 | `@shell/update` | 三通道更新、状态机、清单校验、指针与引导 |
| 窗口 | `@shell/window` | 工作台窗口、WebContentsView 容器、原生浮层宿主、运行韧性 |
| 渲染 | `@shell/ui` / `@shell/bridge` | shadcn-vue 组件与唯一 contextBridge 桥面 |
| 组装 | `apps/shell` | **全仓唯一组装现场** `electron/main/index.ts` + ESM 引导层 + 打包配置 |
| 形态 | `apps/flavors/*` | 产品清单 `flavor.json` |

依赖单向：`ui → 服务 → 领域/基础设施`，下层不得 import 上层；包之间按 `shared ← kernel ← window/app-runtime/devices/update ← apps` 方向引用。

## 快速开始

需要 Node 22 与 pnpm。

```bash
pnpm install
pnpm dev                 # 默认 cemetery 形态
pnpm dev:platform        # 平台日常态演示（业务登记/档案查询/设备台账）
pnpm dev:solo            # 单应用客户端形态
pnpm dev:kiosk           # 自助终端（kiosk）形态
pnpm dev:diagnostics     # 验机形态（硬件自检台）
pnpm verify              # 干净目录里的完整验证
```

`pnpm verify` 把 `git ls-files` 的入库文件复制到干净目录，依次跑 install → guard → design → lint → typecheck → build → design:css → dev 解析阶段（含验机入口），任一失败即非零退出。**结论以机器退出码为准**，不在带构建产物的工作树里宣称全绿。

## 常用脚本

| 命令 | 用途 |
|---|---|
| `pnpm dev` / `pnpm dev:<形态>` | 开发启动（源码直引，零前置构建）；形态可选 cemetery / platform / solo / kiosk / diagnostics |
| `pnpm guard` | 注释词表、类型逃逸、依赖边界、幽灵依赖零容忍检查 |
| `pnpm check:design` | 把 DESIGN.md 的界面禁令变成退出码 |
| `pnpm lint` / `pnpm typecheck` | 静态检查 |
| `pnpm build:win` / `pnpm build:mac` / `pnpm build:linux` | 逐端打包，见 [release.md](./docs/release.md)；换形态打包加环境变量，如 `FLAVOR=platform-demo pnpm build:linux` |
| `pnpm verify` | 干净 clone 可复现验证 |

## 关键约定

- **组合根**：跨系统对象只在 `apps/shell/electron/main/index.ts` 创建，其余模块只经构造函数接收依赖。
- **源码直引**：`packages/*` 的 `exports` 指向 `src/*.ts`，electron-vite 用 `externalizeDeps: false` 内联进 bundle；asar 内无 `node_modules`。
- **浮层统一宿主**：WebContentsView 是原生合成层，会盖住壳内 DOM 浮层。弹窗、通知、菜单、命令面板、设置、拍摄会话、更新提示一律走原生浮层窗。
- **更新双模型**：热更走薄壳 + core asar + 指针 + 判活回滚；整包走六端多目标矩阵（`update/<platform>/<arch>/`）。详见 [update-server.md](./docs/update-server.md)。
- **护栏**：`pnpm guard` 对全仓零容忍，`.guardrails-baseline.json` 为空指纹集；新增规则需先做反向验证。
- **无 CI**：验证收敛到本地 `pnpm verify`，逐端发布在对应平台机器上人工执行。

## 文档

- [部署说明](./docs/deploy.md)：形态、应用注册、权限、数据目录、驱动资产、更新开关
- [构建与发布](./docs/release.md)：六端矩阵、逐端命令、产物结构、真机验证清单
- [更新服务器契约](./docs/update-server.md)：清单格式、安全边界、指针与判活
- [设备边界](./docs/device-boundary.md)、[驱动打包](./docs/driver-packaging.md)

## 真机边界

沙箱内可验证的是 Linux x64 打包与启动链路。Windows / macOS / ARM64 / 国产化 CPU 的真机安装、厂商 DLL、签名公证与 GPG 需在对应设备验证——能力表声明的平台不等于已完成真机验证，逐项状态见 [release.md](./docs/release.md)。
