# Shell UI 飞书感精修

## Context

用户拍板「照着飞书的感觉」精修 Shell。现状问题：①系统标题栏与自绘窗口按钮**并存冗余**（desktop 未设 frame/titleBarStyle）；②168px 文字侧栏过于朴素；③主色 #2563eb 与飞书蓝不符、各组件色值散乱。目标：飞书式沉浸顶栏 + 68px 图标导航 + 统一色板，去掉冗余、提升成熟产品感。

## 设计规范（飞书语言）

- 主色 `#3370ff`（飞书蓝）全量替换 `#2563eb`；语义色保留（绿=运行/完成、红=错误/关闭按钮悬停红）
- hover 灰统一 `#f2f3f5`；激活底 `#e8e9eb`；圆角 6-8px；无毛玻璃、无边框按钮、不用 gap
- 字号：导航文字 11px、Tab 13px、品牌 13px/600

## 改动清单

### 1. 隐藏系统标题栏（apps/desktop/electron/main/index.ts）

- `window` 段加 `browserWindowOptions: { titleBarStyle: 'hidden', backgroundColor: '#f6f7f9' }`（走 WindowOverrides 透传，kiosk 已示范 backgroundColor 防闪白）
- 自绘 ─ □ ✕ 成为唯一窗口控制（IPC 已有，无 core 改动）

### 2. 合并顶栏（App.vue 重构 + TabBar.vue 调整）

- 删除独立 40px `dt-header`；TabBar 上移为顶栏（40px，白底下边框）：
  - **左**：品牌「Desktop」+「应用中心」文字按钮（入口从侧栏底部移此）
  - **中**：Tab 标签——未激活透明灰字、hover `#f2f3f5`、激活 `#e8e9eb` 底深字圆角 6px、关闭按钮激活 Tab 才显（现状保留）
  - **右**：`dt-winbtn` 三键迁入
- **拖拽修复**：顶栏 `-webkit-app-region: drag`；Tab / 按钮 `no-drag`（当前整窗不可拖动，顺带修复）
- TabBar 新增 props：`appCenterOpen?: boolean`，emits 增加 `toggleCenter`；无 Tab 时中间为纯拖拽区

### 3. 左侧栏：飞书式窄导航（AppLauncher.vue 重构）

- 宽度 168px → 68px；导航项纵排（首字母方块 28px 上、11px 文字下、间距紧凑）
- 激活联动：当前激活 Tab 的 App 高亮（蓝字 + 浅蓝底圆角）——新增 props `tabs: DesktopTab[]`
- 底部「应用中心」入口删除（已移顶栏）

### 4. 空态精修（App.vue）

- viewport 空态：主文案「打开一个应用开始工作」+ 副文案「从左侧导航或应用中心进入」，浅灰居中

### 5. 色板统一（四个组件纯色值替换，不动结构）

- PermissionRequests / DownloadsBar / UpdateBar / AppCenter：`#2563eb` → `#3370ff`（状态点、进度条、主按钮、运行点）

## 验证

1. `pnpm typecheck` + `pnpm lint:fix`
2. dev 冒烟：无系统标题栏双行；顶栏可拖动、双击区外按钮正常；最小化/最大化/关闭 IPC 生效；打开 CRM 后 Web 容器贴合无遮挡（ResizeObserver 跟随新布局）；侧栏激活高亮随 Tab 切换；应用中心面板推开正常
3. ROADMAP「待设计决策」条目移入已完成
