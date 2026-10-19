# 双通道更新优化方案（定稿）

> 定稿日期：2026-10-19。本文件是更新链路优化的**唯一执行依据**，整合了整场方案讨论的全部结论；后续 AI coding 与人工开发按本文件执行，执行中发现与本文件冲突时先更新本文件再动代码。
> 修订记录：2026-10-19 末轮两处定稿修正——热更清单接口自由化（不做后端契约要求）、HTTPS/签名降级为部署建议、T-Auth 改为标准能力预置。
> 背景调研依据：`packages/core/src/updater` 现状审计、electron-asar-updater-pro 对比、electron-updater 6.8.9 源码核查（node_modules 实证）。

## 1. 背景与架构现状

平台为 kiosk 形态（殡葬/医院/支付等无人值守设备），更新体系为双通道：

- **整包通道**：electron-updater 6.8.9 generic provider，`latest.yml` + NSIS 安装器（`packages/core/src/updater/update-service.ts`）。负责 Electron 运行时、原生模块（koffi）、厂商 DLL、resources 等asar 装不下的内容。
- **热更通道**：自研 asar 引导器模式（`packages/core/src/updater/asar-update-service.ts` + `packages/core/launcher`）。自描述 zip 校验、版本化终名 + `current.json` 指针切换、三重防变砖、`minResourcesVersion` 资源配对。**该方案经评估优于社区全部公开实现，架构不动。**
- 后端为真实接口（Spring Boot + 数据库表：`version` / `changelog` / `installerUrl`），非静态文件托管。

## 2. 最终决策记录（含否决项，防止重新翻案）

| # | 决策 | 结论 | 理由 / 重开条件 |
|---|---|---|---|
| D1 | 整包通道机制 | **保留 electron-updater（强制模式）**：客户端零适配，后端完全迁就 `latest.yml` 契约 | 自驱化（Route B，VS Code 式自研下载+spawn 安装器）已评估并**否决**，勿再提；仅当后端将来拒绝提供 latest.yml 时重议 |
| D2 | 热更通道接口 | 自研协议保留，**边缘可插拔**：字符串清单模式为主、adapter（endpoint+transform）为逃生门、外部导入留接缝 | 协议核心（校验/指针/引导器）不动 |
| D3 | 通道选择逻辑 | **客户端不做**：两通道并行自判（整包比内置版本、热更比 max(内置,热更)），"区分"在发布侧 | 双通道设计的本意 |
| D4 | 密码学验签（ed25519/HMAC/证书固定/鉴权清单） | **挂起**；HTTPS 与签名均**不做硬要求**，HTTPS 降级为部署建议 | 重开条件：feed 暴露面扩大、或整包开始 Authenticode 签名（届时 ed25519 边际成本≈0 可再议）。HTTP 部署的信任边界退化为网络隔离，由部署方知情接受 |
| D5 | 断点续传 | 不做 | 用户决策 |
| D6 | 发布工具链 | 不做，人工交接 | 用户决策 |
| D7 | UAC 提权写安装目录 | 永不采用 | 无人值守设备不接受提权弹窗；指针模型无需写安装目录 |
| D8 | 差量更新（blockmap） | 后端可选增强 | 上传 blockmap 客户端自动启用差量，客户端零改动；不做不影响上线 |
| D9 | pending 自动生效 / `app.exit(0)` 硬退出 | **保留**（kiosk 语义），以 release.md 契约固化 | 见任务 D2-doc |
| D10 | 热更清单格式改成 latest.yml 形状 | 否决 | 自研协议承载 file/sha256/minResourcesVersion，latest.yml 表达不了 |
| D11 | 整包版本感知客户端修复（原 P0-3） | **移除**，由服务端发布纪律替代 | 见 §3.5；客户端不再加双通道版本拦截 |

## 3. 后端接口契约（可直接转发后端）

消费方：electron-updater 6.8.9 generic provider + 自研 asar 更新服务。**契约硬要求的只有整包清单与产物下载两类 GET**；热更清单的路由与方法、格式**完全自由**（§3.3，自研逻辑只要求结果正确）；无上报回调。

### 3.1 路由（按应用区分）

```
GET https://api.xxx.com/update/{app}/latest.yml          ← 整包清单（路径结尾 /latest.yml 为客户端硬约束，前缀任意；可为动态接口，不要求磁盘文件）
GET <热更清单地址>                                        ← 热更清单：路由与格式不做契约要求（自研更新逻辑，唯一要求是结果正确，见 §3.3）
GET <path/url 字段指向的地址>                              ← 安装器 / 热更 zip 字节流（可托管外部存储）
```

客户端拉取时机：启动 + 手动检查，无轮询。主进程请求：无需 CORS。

### 3.2 整包清单字段

响应体 **JSON 或 YAML 均可**（JSON 是 YAML 子集，已用 6.8.9 自带 js-yaml 实测解析通过；上线真机冒烟一次即可）：

```json
{
  "version": "1.4.2",
  "path": "https://files.xxx.com/desktop/Desktop-1.4.2-x64.exe",
  "sha512": "<安装器 exe 的 SHA-512，base64 编码>",
  "releaseDate": "2026-10-19T03:00:00.000Z",
  "releaseNotes": "1. 修复xxx；2. 优化xxx"
}
```

| 字段 | 必填 | 规则 |
|---|---|---|
| `version` | 是 | **必须与安装器内部版本一字不差**（不一致 = 每次启动重装死循环）；合法 semver |
| `path` | 是 | 安装器下载地址，**推荐绝对 URL**（可指向外部存储，不要求与清单同域）；备选：后端对安装器路由 302 重定向到 installerUrl（Electron 网络栈默认跟随），或安装器与清单同前缀以相对文件名提供；任一方式均需真机验证一次 |
| `sha512` | 是 | base64（非 hex），上传时服务端计算。**功能性必需**：缺失时客户端缓存校验恒失配、每次全量重下（6.8.9 源码实证） |
| `releaseDate` | 是 | ISO 8601，取记录激活时间 |
| `releaseNotes` | 否 | 更新内容（表 changelog），客户端 UI 展示 |

### 3.3 热更清单（路由与格式不做契约要求）

热更为自研更新逻辑，**接口自由**：路由、方法（GET/POST）、响应格式均由各 app 的适配器（`UpdateAsarSource.endpoint + transform`）与后端自行约定，鉴权也在适配器 headers 中实现（任务 T5）。后端唯一需要保证的：**版本数据可获取、zip 可下载、结果正确**。默认/建议形状（与客户端零适配的字符串清单模式配套）：

```json
{ "version": "1.4.3", "url": "https://files.xxx.com/desktop/core-1.4.3.zip" }
```

sha256 / 包内文件名 / `minResourcesVersion` 全部在 zip 内 `update.json` 自描述，后端零逻辑。

### 3.4 表结构与 HTTP 行为

- 表增量：`installerSha512`（base64，纯热更发布时为空）、`asarZipUrl`（可空，纯整包发布（未含热更包）时为空；各清单取"最新非空记录"生成）。
- HTTPS 为**部署建议**而非硬要求（D4：HTTP 部署由部署方知情接受风险）；两个清单 `Cache-Control: no-cache`；安装器/zip 返回 `Content-Length`（进度条）；无激活记录返回 404（客户端按无更新容错）。
- 鉴权：整包通道由客户端支持传入授权 header（T-Auth，默认关闭、部署按需启用），仅支持静态请求头（electron-updater 约束）；热更通道由适配器实现（T5 提供静态 method/headers/body，更复杂的鉴权逻辑可直接写在适配器代码内），无此限制。
- 可选增强：接收 blockmap（自动差量）；按设备/百分比返回不同 version（灰度，客户端零改动）。鉴权为标准能力（见上条），不属于可选增强。

### 3.5 发布纪律（发布管理端执行并校验）

1. 上传产物 → 服务端计算**安装器** sha512 落库（热更 zip 的 sha256 在打包时写入包内 update.json，后端无感）→ **激活记录即清单原子翻转**（动态生成无中间态，无静态托管的时序问题）。
2. 已发布版本内容不可变；修正问题 = 发布更高版本。
3. **热更 version 严格大于该应用线上所有已发布版本**；**整包 version 必须大于线上最高热更 version**（违反则已装热更设备白下载且整包被热更压制）。建议发布端保存时校验拦截。
4. 回滚 = 发布更高 version 携带旧包。

## 4. 客户端任务清单

> 通道标注：**整包** = 随下次整包安装器发布；**热更** = 可经热更通道单独下发。引导器（`packages/core/launcher/out/main/index.cjs`，手写 CJS，该文件即源码与产物一体）任何改动只能走整包。

### T1（P0·整包）判活从墙钟改为进程内计时

- **问题**：`settleOrRollback()` 以 `Date.now() - firstRun.startedAt < 60_000` 判定回滚。kiosk 时钟回拨（CMOS 耗电、NTP 校时）使差值为负，运行多日的健康版本被误判回滚。
- **改法**：`applyPending()` 写 `first-run.json` 不变；`loadCore()` 成功加载后进程内 `setTimeout(60s)` 删除该文件（稳定）。`settleOrRollback()` 改为只判文件存在性：仍存在 = 上次未活过 60 秒 → 回滚。`startedAt` 保留仅作日志。语义与现状等价，唯一差异是对系统时钟免疫。
- **涉及**：`packages/core/launcher/out/main/index.cjs`、`packages/core/test/launcher.test.ts`
- **验收**：单测覆盖稳定删除 / 未稳定回滚 / 无标记不动；存活判定不读墙钟（可 fake timers）。

### T2（P0·热更）资源门槛拦截改为 `blocked` 独立状态

- **问题**：`minResourcesVersion` 不满足时推 `idle`，现场无法区分"没有更新"和"在等整包"。
- **改法**：`AsarUpdateState.status` 联合类型加 `'blocked'`，负载带 `version` 与 `minResourcesVersion`；`asar-update-service.ts` 资源门槛分支改推 `blocked`（清单无效分支保持 `idle`）；`UpdateBar.vue` 展示"已检测到新版本 x，需整包更新后生效"。
- **涉及**：`packages/shared/src/types/update.ts`、`packages/core/src/updater/asar-update-service.ts`、`apps/desktop/src/components/UpdateBar.vue`（`use-update.ts` 仅转发预计不动；其他 app 壳按同一事件契约自行跟进）
- **验收**：类型检查通过；构造旧 resources 场景（或单测 mock）验证 blocked 推送与文案。

### T3（P1·整包，与 T1 同车）`compareVersions` 预发布序修复 + 双实现一致性测试

- **问题**：`'1.0.0-beta'` 被判大于 `'1.0.0'`（预发布段退化为字符串比较）；TS 与引导器 CJS 两份实现靠注释人工同步。
- **改法**（不引依赖，引导器必须零依赖 CJS）：核心数字段照旧（缺段补 0）；核心相等时**带预发布的更旧**；预发布标识符逐段比较（数值 vs 数值、字母 vs 字典序、**数值 < 字母**、前缀相同段少者旧）；`+` 构建元数据忽略；保持"绝不返回 NaN"不变量。新增一致性测试：同一向量组同时断言 `version.ts` 与引导器导出的 `compareVersions`，任一侧漂移即失败。
- **涉及**：`packages/core/src/updater/version.ts`、`packages/core/launcher/out/main/index.cjs`、新增 `packages/core/test/` 一致性测试
- **验收**：向量组含等长补零、预发布序、降级、混合段；两实现全部通过。

### T4（P1·热更）热更下载可取消

- **改法**：`AsarUpdateService` 持有 `AbortController`，新增 `cancel()`；`downloadAndVerify` 流接入 signal，AbortError 归入容错路径（清理 + 推 `idle`）；`packages/core/src/ipc/update.ts` 暴露给 Shell（UI 暂不做）。
- **附带**：主文件已 309 行超限（AGENTS.md §3.1），实现时顺带将下载职责抽至 `packages/core/src/updater/download.ts`。
- **验收**：下载中途 cancel 后状态归位、临时文件清理、再次 check 正常。

### T5（P1·热更）热更清单请求定制（原 P1-5 回归）

- **改法**：`UpdateAsarSource` 增加可选 `method?: 'GET' | 'POST'`（默认 GET）、`headers?: Record<string, string>`、`body?: string`；`fetchJson` 透传给 `net.fetch`。字符串清单源不受影响。**不做**全开放 fetcher 回调（过度抽象）。
- **涉及**：`packages/shared/src/types/update.ts`、`packages/core/src/updater/asar-update-service.ts`
- **验收**：类型检查；单测断言 method/headers/body 透传；headers 场景覆盖适配器鉴权（如 `X-Api-Key`）。

### T6（P1·热更）`quitAndInstall` 静默修复（一行）+ 真机验证

- **问题**：`update-service.ts` 的 `install()` 调无参 `quitAndInstall()`（6.8.9 默认 `isSilent=false, isForceRunAfter=false`）：安装向导弹窗、装完不拉起——kiosk 定时重启凌晨触发时屏幕停向导、应用关机态。
- **改法**：改为 `quitAndInstall(true, true)`（NSIS `/S --force-run`：静默 + 装完自拉起）。
- **真机验证**：assisted 安装器（`oneClick: false`）静默模式行为——记忆目录（installer.nsh）、运行中进程处理、自拉起。
- **部署配套**：kiosk 装机统一**用户级目录**（默认 `%LocalAppData%\Programs`）；装到 Program Files 则静默更新时 UAC 悬挂（写入 release.md）。

### T7（P1·热更）退出竞态验证与防御

- **问题**：三个重启路径（`resilience.ts` 定时重启两处、`asar-update-service.ts` `install()`）均为 `app.relaunch(); app.exit(0)`；而 electron-updater `addQuitHandler` 在 quit 事件且 exitCode=0 时 `install(true, false)`（静默装、不拉起）。`app.exit(0)` 是否触发 quit 事件 Electron 文档未明确——若触发，relaunch 已武装新实例、安装器同时替换安装目录，存在竞态。
- **改法**：先真机验证行为；防御性修复：重启路径上若整包已下载且新于生效版本 → 改走 `quitAndInstall(true, true)` 接管退出；否则临时置 `autoInstallOnAppQuit = false` 再 relaunch。此比较仅用于重启路径择优，不是 D11（P0-3 下载拦截）的复活。
- **涉及**：`packages/core/src/resilience/resilience.ts`、`packages/core/src/updater/update-service.ts`
- **验收**：真机验证记录入 release.md；两分支行为符合预期。

### T-Auth（P1·整包）支持传入授权 header

- **需求**：整包更新支持传入授权 header（定稿：只要求"支持"这一能力，是否启用由后端/部署决定）。electron-updater 仅支持静态请求头（不支持改方法 / POST body / cookie 会话）；6.8.9 源码已核 `requestHeaders` 对清单 + 安装器下载同时生效。
- **改法**：`update-service.ts` `setFeedURL` 后按配置设置 `this.autoUpdater.requestHeaders`（如 `{ 'X-Api-Key': token }`）；token 经 `DESKTOP_UPDATE_TOKEN` 环境变量注入（沿用 `DESKTOP_UPDATE_FEED` 模式），未配置则不带头（默认关闭）。
- **验收**：配置 token 后真机确认清单与安装器下载两个请求均带头；未配置时行为与现状一致。

### T8（P2·按需）崩溃环检测

- **改法**：`first-run.json` 增 `cleanShutdown` 标记（热更核心 `before-quit` 打标）；引导器发现连续 N 次非正常退出且每次存活 < T 才回滚。参数保守（建议 N=3、T=2 分钟），**先观察 launcher.log 真实退出分布再定参**（定时重启、断电都是误报源）。
- **通道**：引导器侧整包。

### T9（P2·按需）下载即清孤儿

- **改法**：写新 `pending.json` 时删除 `core-*.asar` 中非 current、非本次下载的文件（现要等 settle 才清）。
- **涉及**：`asar-update-service.ts`。**通道**：热更。

### T10（P2·按需）整包通道小项束

- 手动 `check()` 撞上下载中时推状态（现只记日志，UpdateBar 卡 checking）；`error.message` 不直出用户（映射业务文案）；评估 `isDownloaded()` 仅内存态的影响（重启后自愈一个检查周期）。
- **涉及**：`update-service.ts`。**通道**：热更。

### T11（预留·不实现）外部导入热更包接缝

- **现状**：接缝已存在——`applyBundle(zipPath, version)` 接受本地路径，协议核心对来源中立。
- **将来实现 `importBundle(zipPath)` 时必须复用同一守卫管线**：版本 > 生效版本（防降级）、`minResourcesVersion` 门槛、包内 update.json 自描述校验、写 pending、推同一 `update:asarState` 事件。外部导入无外部清单做版本一致性比对，以包内 update.json 为准（信任源 = 导入方）。
- **触发条件**：出现真实消费者（管理台 / USB 预置 / MDM 下发）才实现，不预写代码。

## 5. 文档任务

| # | 文件 | 内容 |
|---|---|---|
| D1-doc | `docs/update-server.md` | 按真实接口后端重写：§3 契约全文替换现有"纯静态托管"表述；删除 blockmap 必要性描述（改为可选增强）；新增双通道对照表（同一发布记录 → 两个清单视图的字段映射）；保留客户端容错说明 |
| D2-doc | `docs/release.md` | 增补四节：① 发布通道判定表（默认热更、触碰 asar 纯 JS 契约才整包、`minResourcesVersion` 配合模式）；② 版本纪律（热更严格递增、整包 > 线上最高热更）；③ kiosk 装机目录规范（用户级安装避免静默更新 UAC 悬挂）；④ 平台契约与风险记录（所有服务必须容忍 `app.exit(0)` 硬退出、关键状态写入即落盘；整包零回滚——高风险变更走热更、整包发布前真机验证） |

## 6. 发布节奏

| 批次 | 内容 | 通道 |
|---|---|---|
| 整包一次 | T1 + T3（引导器改动强制同车），搭载 T2 / T4 / T5 / T6 / T7 代码 | 整包 |
| 随后 | T2 / T4 / T5 若未随整包搭载，单独热更 | 热更 |
| 常规 | T-Auth（能力预置，默认关闭） | 热更 |
| 按需 | T8 / T9 / T10 | 热更（T8 引导器侧整包） |
| 不发版 | D1-doc / D2-doc；T11 仅设计留档 | — |

**顺序硬约束**：引导器改动（T1/T3/T8）必须整包；后端 `installerSha512` 列上线前，latest.yml 不得缺该字段上线（先加列后切换）。

## 7. 验证要求

- `packages/core` 单测：vitest 全量通过，含新增版本一致性测试与 launcher 判活测试。
- ESLint + TypeScript 类型检查（`@desktop/shared` 类型变更时同步确认各 app 编译）。
- 引导器改动：`packages/core/launcher/out/main/index.cjs` 即源码，改动后确认 `require.main !== module` 测试导出路径未被破坏。
- 真机验证清单（逐项记录结论入 release.md）：① latest.yml JSON body 解析冒烟；② `path` 绝对 URL 解析；③ `/S --force-run` 静默安装时序（记忆目录 / 自拉起 / Program Files 的 UAC 行为）；④ `app.exit(0)` 是否触发 quit 事件（T7 前置）；⑤ blocked 状态展示；⑥ T-Auth 配置 token 后清单与安装器下载均带头、未配置不带头。
