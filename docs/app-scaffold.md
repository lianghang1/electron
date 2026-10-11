# 脚手架与模板扩展指南

`pnpm gen:app <slug> <中文名>` 按 `scripts/templates/app/` 模板树生成 Kiosk 形态应用
（全屏 + 韧性 + 设备接入 + 更新体系，与 apps/funeral-kiosk 同构）。

## 模板即真实文件

模板是**可编辑、可 lint、可 diff 的真实文件**（不是字符串拼接）。生成器只做三件事：
遍历模板树 → 替换令牌 → 生成后自检。

| 令牌 | 替换为 | 示例 |
|---|---|---|
| `@@SLUG@@` | kebab-case 应用名 | `census` |
| `@@APP_ID@@` | 打包身份 | `com.company.census` |
| `@@PRODUCT_NAME@@` | ASCII 产品名（slug 大驼峰） | `Census` |
| `@@DISPLAY_NAME@@` | 中文显示名 | `人口普查自助终端` |

> 令牌用 `@@XXX@@` 而非 `__XXX__`：后者与 vite define 全局常量
> （`__VITE_API_BASE_URL__` 等）命名冲突，残留扫描会误报。

## 生成后自检（自动，失败即回滚删除）

1. **残留令牌扫描**：任何文件残留 `@@XXX@@` → 报错指出文件与令牌（模板忘加映射立即暴露）
2. package.json 合法性 + `main === './out/main/index.cjs'`（CJS 入口契约）
3. 所有 `.cjs` 过 `node --check`
4. `identity.cjs` require 断言导出与命令行参数一致
5. 失败自动删除半成品目录（避免未替换的 catalog 依赖污染 `pnpm install`）

## 扩展模板的规则

- **新增/修改模板文件**：直接编辑 `scripts/templates/app/` 下的真实文件；需要应用差异处放令牌，
  并确认 `generate-app.ts` 的 TOKENS 已覆盖（生成一次即可验证）。
- **继承的契约不可在生成物里破坏**：files 白名单、`asarUnpack` 永不配置、bundle 自包含、
  设备资源走根 `resources/devices` 单一来源（junction 由 postinstall 自动建立，生成后无需复制）。
- **业务 IPC**：参照 `apps/funeral-kiosk/electron/main/ipc` 的域通道表模式；模板的
  `electron/main/index.ts` 与 `preload/index.ts` 已留锚点注释。
- **渲染层骨架已对齐 kiosk**：vue-router（auto-routes）+ pinia（persistedstate）+ UnoCSS +
  auto-imports + alova http 封装 + dayjs——生成即可直接写业务页面（`src/pages/` 即路由）。

## 生成之后

```bash
pnpm install                                       # 建 workspace 链接 + 设备资源 junction
pnpm --filter @app/<slug> dev                      # 开发冒烟
pnpm --filter @app/<slug> build:win                # 打包
pnpm exec tsx scripts/e2e-packaged.ts <slug>       # 打包冒烟（建议作为生成应用的验收步骤）
```
