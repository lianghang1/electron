# 壳平台 · 设计系统

本文件是界面与组件的单一事实源。根目录 `AGENTS.md` 管工程约定，本文件管视觉约定；改动界面前先读这里。颜色/字号数值只在 `packages/ui/src/styles/tokens.css` 出现一次，本文件不复制数值。

## 组件体系

`shadcn-vue` 不是运行时依赖，而是 CLI + 组件源码分发：源码直接归属仓库、可随意修改；行为层由 `reka-ui` 提供，样式由 Tailwind v4 + `class-variance-authority` + `cn()`（`clsx` + `tailwind-merge`）组合。所以依赖里没有 `shadcn-vue`，只有它生成源码所需的三个库，这是官方形态而非缺失。

| 项 | 位置 |
|---|---|
| CLI 配置 | `packages/ui/components.json`（style / cssVariables / aliases） |
| 组件源码 | `packages/ui/src/components/<name>/`，每个目录含 `.vue` 与 `index.ts` 出口；按官方 registry 全量落地 |
| `cn()` | `packages/ui/src/lib/utils.ts` |
| `@ui/*` 别名 | `packages/ui/tsconfig.json`、`apps/shell/tsconfig.web.json`、`apps/shell/electron.vite.config.ts` 三处登记（后两者解析跟随 symlink 进入 ui 源码时必需） |
| 业务侧消费 | 只经 `@shell/ui` 单一门面；壳内组件可直接用 `@ui/components` |

组件只用官方预设，不带项目专属变体：Button 的变体是 `default` / `secondary` / `outline` / `ghost` / `destructive` / `link`。图标统一 `@lucide/vue`（`@lucide/*` 不引入第二套）。进场动画用 `tw-animate-css` 官方约定（`animate-in fade-in zoom-in-95`）。

新增组件用 `pnpm dlx shadcn-vue@latest add <name>` 并指定工作目录为 `packages/ui`；生成后必须按本文件核对别名、令牌与变体，不允许直接落库就提交。

## 两层令牌

| 层 | 位置 | 职责 |
|---|---|---|
| 语义变量 | `:root` | 官方 slate oklch 值；`--primary` 是 `flavor.branding.accent` 注入点；`.dark` class 深色覆盖 |
| 消费层 | `@theme inline` | 注册 `--color-*` / `--radius-*` 等映射，生成 Tailwind 工具类 |

- 深浅切换用 `.dark` class（Tailwind `dark:` custom-variant），不是 `data-theme`。
- 项目偏离仅三处，登记在 `tokens.css` 头注释：`@source` 显式扫描 shell 源码、body 不涂底（磨砂材质透窗）、`--spacing-chrome-solo` 标题栏高度。
- `@theme inline` 不可省略：缺了 `inline`，Tailwind 会把值固化进 `--color-*`，flavor 主色注入与主题切换不会反映到已生成的工具类上。

## 颜色消费规则

- 页面根 `bg-background text-foreground`；壳窗磨砂 `bg-background/85` + `backdrop-blur-xl`（透 OS 材质）；卡片 `bg-card`；浮层面板 `bg-popover`。
- 文字两级：`text-foreground` / `text-muted-foreground`；危险与错误 `text-destructive`。
- 主按钮 `bg-primary text-primary-foreground`（Button `default`）；弱强调 `bg-accent text-accent-foreground`；危险底 `bg-destructive text-white`。
- 描边 `border-border` / `border-input`；焦点 `ring-ring` / `focus-visible:border-ring`；浮层遮罩 `bg-black/35`。
- 状态色（成功/进行中）用 Tailwind 默认色阶 + `dark:` 变体（emerald / amber），不自造语义变量。
- 阴影官方档：卡片 `shadow-sm`、浮层面板 `shadow-lg`。
- 模板里禁止 hex、`rgba()`、命名随手色与透明度随手值（`text-white/60` 一类）；彩色底上的白字（首字徽标类）用 `text-white`。运行时才确定的颜色（如 tab 图标按 appId 着色）允许 `:style`，但值只能来自数据，不能承载样式决策。
- 例外三处（刻意为之，非漏洞）：`index.html` 的同步注入（写 `--primary` 与 `.dark`，先于首帧）、`src/styles/splash.css` 启动层（先于 bundle，固定深色 logo 壳）、`pages/recovery/index.vue`（崩溃兜底页，样式表可能未到达）。

## 字号与圆角

- 字号只用官方档位：`text-xs` / `text-sm` / `text-base` / `text-lg` / `text-xl`…，禁止 `text-[Npx]` 与内联 `font-size`。
- 圆角由 `--radius` 单输入派生官方档位：`rounded-md` / `rounded-lg` / `rounded-xl` / `rounded-full`，禁止 `rounded-[Npx]`。
- 布局用标准刻度：`h-chrome-solo`（30px）标题栏与 solo 控制条，其余用刻度类。
- 避免任意 `w-[...]` / `h-[...]`，仅浮层面板定版尺寸与定位例外。

## 三档形态约束

- `kiosk`：直接打开唯一应用；没有首页、设置、空状态、窗口控制条。
- `solo`：单应用，30px 控制条，应用不可关闭；内容区 `bg-primary` 垫场防白屏。
- `platform`：多应用可开关，tab 条 + 图标栏 + 命令面板 + 空状态时钟，⌘K/Ctrl+K 唤起。
- 壳无名称、无欢迎语、无营销式渐变装饰；灰阶 + 单强调色。

## 主题与 flavor

`bootstrapAppearance()`（`apps/shell/src/styles/appearance.ts`）在挂载前注入 `--primary`（来自 `flavor.branding.accent`，`#rrggbb` 校验）并按 `.dark` class 切深浅，`applyTheme()` 跟随系统变化。`index.html` 里另有一份同步注入，先于首帧定色，避免「回退色首帧 → 品牌色翻转」的双蓝竞态。悬停/激活态一律走官方语义（`--accent`），不自造第二处色值。

## 验证

- `pnpm guard`：注释词表、类型逃逸、依赖边界全仓零容忍。
- `pnpm check:design`：扫全部 `.vue` 模板，拦截自造令牌直引（`var(--dt-*)` 等已删令牌）与任意字号。
- `pnpm check:design:css`：构建后核验——圆角档值内联 `var(--radius)`、壳窗磨砂类在产物中存在、`@theme inline` 未把变量固化；失败即意味着主题切换会失效。
- `pnpm typecheck`：组件 props 与 `@ui` 别名解析。
- `pnpm verify`：干净 clone 全链路，含上述各项与构建后无中间 `dist`。
- 视觉结论必须来自实际启动截图，不能只靠构建退出码。

## 禁止

- 把颜色数值复制到第二处（含文档）。
- 新增与 `components` 平行的自建皮肤组件体系；新增 `--glass` / `--hover` 一类自造变量。
- 在 `@theme` 里省略 `inline`。
- 用 reka-ui 裸组件绕过 `components` 的样式约定。
- 把任意字号、随手颜色、过程性注释带进界面代码。
