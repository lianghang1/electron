# 应用中心 UI 实现方案

## Context

ROADMAP #12 已打通应用中心远程源（apps.remoteUrl），数据层全部就绪，只差最后一层 UI：用户能看到已注册的全部应用（内置/本地/远程）、了解每个应用的权限与运行状态、并从统一入口打开应用。这是「应用中心」闭环的最后一块。

**关键架构约束**：Tab 内容由 WebContentsView（原生层）渲染，永远绘制在 Shell DOM 之上 —— 覆盖式弹窗/遮罩盖不住 Web 区。因此应用中心采用**左侧推开式面板**（flex 布局成员，出现时 dt-main 自动右移收缩，ResizeObserver 已有机制自动同步 workArea，WebContentsView 跟随）—— 与底部权限横幅同一让位模式，也正是用户偏好的「主内容推开」交互。

## 设计决策

| 决策 | 内容 | 依据 |
| --- | --- | --- |
| 形态 | 左侧推开式面板（360px，白底右边框），入口在左侧栏底部「应用中心」按钮 | WebContentsView 层级限制 + 用户偏好推开式 |
| 与左侧栏分工 | 左侧栏=快捷启动（少量高频），应用中心=管理面（全量+权限+来源） | 类飞书侧栏+工作台模式，避免功能重叠争议：侧栏是入口不是管理面 |
| 数据 | 全部走现成通道：`app.list` / `tabs:updated` / `tabs.open` / `permission.list` | 无需新增 IPC |
| 来源标识 | **做**：`RegisteredApp = { manifest, source }`，source ∈ code/apps.json/remote | 远程源闭环的自然部分，改动小 |
| 搜索 | 不做（第一版） | App 数量少，YAGNI |
| 安装/更新按钮 | 不做 | Web App 无安装概念；平台更新是 UpdateBar 职责，避免功能重叠 |
| 权限详情 | 卡片内展开，调 `permission.list(appId)` 展示声明/授权合成状态 | 数据现成 |

## 实现步骤

### 1. shared：类型与契约（packages/shared）

- `src/types/manifest.ts` 新增：
  ```ts
  export type AppSource = 'code' | 'apps.json' | 'remote'
  export interface RegisteredApp {
    manifest: DesktopAppManifest
    source: AppSource
  }
  ```
- `src/types/ipc.ts`：`'app:list'` 返回类型 `DesktopAppManifest[]` → `RegisteredApp[]`
- `src/types/api.ts`：`app.list` 同步改 `Promise<RegisteredApp[]>`

### 2. core：AppRegistry 记录来源（packages/core）

- `src/app/app-registry.ts`：内部 Map 存 `RegisteredApp`；`register(app, source: AppSource = 'code')`；`list()` 返回 `RegisteredApp[]`；`get()/has()` 行为不变（仍返回/判断 manifest，消费方无感）
- `src/application/desktop-application.ts`：`registerApps()` 循环把现有 source 参数（'code'/'apps.json'/'remote'）传给 `registry.register(manifest, source)` —— 现在只用于日志，顺路传下去
- 唯一 `app:list` 消费方 `src/ipc/register.ts` L50 无需改动（返回类型自动跟随）

### 3. Shell UI（apps/desktop/src）

- **`composables/use-apps.ts`**：`apps` 类型改 `RegisteredApp[]`
- **`composables/use-permission-labels.ts`（新）**：把 `use-permission-requests.ts` 内部的 `PERMISSION_LABELS` 提取为共享导出（label 映射两处复用）；原文件改为 import
- **`components/AppCenter.vue`（新）**：
  - Props：`apps: RegisteredApp[]`、`tabs: DesktopTab[]`；Emits：`open(appId)`、`close`
  - 卡片列表：首字母图标（沿用 AppLauncher 模式，manifest.icon 未配置时占位）、名称、版本号、类型（internal/third-party 文案）、来源（内置/本地配置/远程）、运行状态点（tabs 里存在该 appId 即运行中）
  - 点击卡片 → emit open（平台已有防重复：已开即激活）
  - 卡片右侧展开箭头 → 展开权限区：懒加载 `window.desktop.permission.list(appId)`；每行权限名（PERMISSION_LABELS）+ 状态文案映射：
    - declared → 「已声明」；!declared && granted===true → 「已授权」；granted===false → 「已拒绝」；granted===null → 「按需询问」
  - 样式：`ac-` 前缀、scoped CSS、白底、#e5e7eb 边框、#2563eb 主色点缀；**不用 gap（用 margin）**、无毛玻璃、无 emoji，跟随现有组件风格
- **`components/AppLauncher.vue`**：底部（margin-top: auto）加「应用中心」文字按钮，emit `openCenter`；props 类型跟随 RegisteredApp（内部取 `app.manifest.*`）
- **`App.vue`**：
  - `appCenterOpen` ref；dt-body 中 AppLauncher 之后插 `<AppCenter v-if/Transition>`（flex 成员推开 dt-main）
  - 接 AppLauncher 的 `openCenter`；AppCenter 的 `open` 直连现有 `open(appId)`

### 4. 文档与记忆

- `docs/ROADMAP.md`：#12 说明补充「应用中心 UI」或新增一行 ✅；「长期方向」中「应用中心」条目更新（剩余：按需加搜索等）

## 验证

1. `pnpm typecheck` + `pnpm lint:fix`（根目录）
2. dev 冒烟（`pnpm dev`）：
   - 点击「应用中心」→ 面板推开 dt-main，打开一个 App 确认 WebContentsView 跟随新 workArea（无遮挡/空隙）
   - CRM/OA 卡片：打开后运行状态点亮；再点卡片=激活既有 Tab 不新开
   - 展开 CRM 权限详情：显示 已声明(storage/clipboard.read/download)
   - 运行时权限横幅决策后重新展开详情，状态同步
3. 远程源联调（可选）：`node apps/desktop/scripts/update-test-server.mjs` + `DESKTOP_APPS_REMOTE` 环境变量 → wiki 卡片来源显示「远程」
4. `pnpm build` 确认打包无回归
