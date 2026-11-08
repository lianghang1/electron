# 壳平台 v2 · 设计系统

本文件是界面与组件的单一事实源。`AGENTS.md` 管工程约定，本文件管视觉约定；改动界面前先读这里。颜色数值只在 `packages/ui/src/styles/tokens.css` 出现一次，本文件不复制数值。

## 组件体系

`shadcn-vue` 不是运行时依赖，而是 CLI + 组件源码分发：源码直接归属仓库、可随意修改；行为层由 `reka-ui` 提供，样式由 Tailwind v4 + `class-variance-authority` + `cn()`（`clsx` + `tailwind-merge`）组合。所以依赖里没有 `shadcn-vue`，只有它生成源码所需的三个库，这是官方形态而非缺失。

| 项 | 位置 |
|---|---|
| CLI 配置 | `packages/ui/components.json`（style / cssVariables / aliases） |
| 组件源码 | `packages/ui/src/components/ui/*`，每个目录含 `.vue` 与 `index.ts` 出口 |
| `cn()` | `packages/ui/src/lib/utils.ts` |
| `@ui/*` 别名 | `packages/ui/tsconfig.json`、`apps/shell/tsconfig.web.json`、`apps/shell/electron.vite.config.ts` 三处登记（后两者解析跟随 symlink 进入 ui 源码时必需） |
| 业务侧消费 | 只经 `@shell/ui` 单一门面；壳内组件可直接用 `@ui/components/ui` |

现有组件：`Button`、`Input`、`Dialog`（含 Content/Header/Title/Description/Footer/Close）、`Tooltip`（含 Content/Provider/Trigger）、`Switch`、`Badge`、`Separator`、`Kbd`。Button 的 `soft` 变体是项目专属（accent 派生底 + accent 前景），不在官方预设内。

新增组件用 `pnpm dlx shadcn-vue@latest add <name>` 并指定工作目录为 `packages/ui`；生成后必须按本文件核对别名、令牌与变体，不允许直接落库就提交。

## 三层令牌

| 层 | 位置 | 职责 |
|---|---|---|
| 物理层 | `:root` 的 `--dt-*` | 原始色值、`flavor.branding.accent` 注入点 `--dt-accent`、`[data-theme='dark']` 深浅覆盖 |
| 语义层 | `:root` 的官方变量 | `--background` / `--foreground` / `--card` / `--popover` / `--primary` / `--secondary` / `--muted` / `--accent` / `--destructive` / `--border` / `--input` / `--ring` / `--radius`，以及项目扩展 `--glass` / `--foreground-subtle` / `--hover` / `--overlay` / `--elevation-*` |
| 消费层 | `@theme inline` | 注册 `--color-*` / `--radius-*` / `--shadow-*` / `--text-ui-*` / `--spacing-*`，生成 Tailwind 工具类 |

语义层的值只引用物理层，不写死颜色；深色主题只覆盖物理层，语义层零重复。

`@theme inline` 不可省略：缺了 `inline`，Tailwind 会把值固化进 `--color-*`，flavor 主色注入与主题切换不会反映到已生成的工具类上。

## 颜色消费规则

- 页面根 `bg-background text-foreground`；窗口玻璃 `bg-glass`；卡片 `bg-card`；浮层 `bg-popover`。
- 文字三级：`text-foreground` / `text-muted-foreground` / `text-foreground-subtle`。
- 主按钮 `bg-primary text-primary-foreground`；弱强调 `bg-accent text-accent-foreground`；危险 `bg-destructive text-destructive-foreground`；悬停 `bg-hover`。
- 描边 `border-border`；焦点 `ring-ring` / `focus-visible:border-ring`；遮罩 `bg-overlay`。
- 阴影 `shadow-card` / `shadow-float` / `shadow-window`。
- 模板里禁止 `var(--dt-*)`、十六进制、`rgba()` 与 `text-white/60` 一类随手值。运行时才确定的颜色（如 tab 图标按 appId 着色）允许 `:style`，但值只能来自数据，不能承载样式决策。
- 例外：`apps/shell/src/index.html` 的内联启动层在样式表加载前运行，允许直接引用 `--dt-*` 并自带 fallback。

## 字号阶梯

单一输入 `--ui-font-size`（默认 13px），阶梯由 `calc()` 派生。界面文字必须用 `text-ui-*`，禁止 `text-[13px]`、`text-sm`、内联 `font-size`。

| 类 | 值 | 角色 |
|---|---|---|
| `text-ui-xs` | 10px | 徽标、计数器、极弱元数据 |
| `text-ui-sm` | 11px | 辅助文字、快捷键、页脚 |
| `text-ui-caption` | 12px | 表格、次级说明 |
| `text-ui-base` | 13px | 正文、按钮、标题 |
| `text-ui-lg` | 15px | 面板标题 |
| `text-ui-xl` | 18px | 一级标题 |
| `text-ui-display` | 64px | 仅空状态时钟，固定不随 `--ui-font-size` 缩放 |

改全局字号只动 `--ui-font-size`，不改 `html` 或 `documentElement.style.fontSize`。

## 圆角与尺寸

- `--radius-md` 覆盖 Tailwind 默认档并绑定 `--radius`，让官方组件惯用的 `rounded-md` 与项目圆角一致。
- `rounded-window`（12px）用于窗口与对话框；`rounded-icon`（10px）用于图标按钮。
- 布局用标准刻度：`h-11` 标题栏、`w-16` 图标栏、`size-10` 图标、`h-chrome-solo`（30px）solo 控制条。
- 避免任意 `rounded-[...]` / `w-[...]` / `h-[...]`，仅浮层定位等无法用刻度表达时例外。

## 三档形态约束

- `kiosk`：直接打开唯一应用；没有首页、设置、空状态、窗口控制条。
- `desktop-solo`：单应用，30px 控制条，应用不可关闭；内容区 `bg-primary` 垫场防白屏。
- `desktop-platform`：多应用可开关，tab 条 + 图标栏 + 命令面板 + 空状态时钟，⌘K/Ctrl+K 唤起。
- 壳无名称、无欢迎语、无营销式渐变装饰；灰阶 + 单强调色。

## 主题与 flavor

`bootstrapAppearance()` 在挂载前注入 `--dt-accent`（来自 `flavor.branding.accent`）并按 `data-theme` 切深浅，`applyTheme()` 跟随系统变化。soft / hover / ring 一律由 `color-mix` 派生，不写第二处色值。

## 验证

- `pnpm guard`：注释词表、类型逃逸、依赖边界全仓零容忍。
- `pnpm check:design`：扫全部 `.vue` 模板，拦截物理层直引、任意字号、内置字号。
- `pnpm check:design:css`：构建后核验语义类确实生成，且 `@theme inline` 未把变量固化；失败即意味着主题切换会失效。
- `pnpm typecheck`：组件 props 与 `@ui` 别名解析。
- `pnpm verify`：干净 clone 全链路，含上述两项与构建后无中间 `dist`。
- 视觉结论必须来自实际启动截图，不能只靠构建退出码。

## 禁止

- 把颜色数值复制到第二处（含文档）。
- 新增与 `components/ui` 平行的自建皮肤组件体系。
- 在 `@theme` 里省略 `inline`。
- 用 reka-ui 裸组件绕过 `components/ui` 的样式约定。
- 把任意字号、随手颜色、过程性注释带进界面代码。
