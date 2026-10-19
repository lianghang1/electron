# 更新服务器对接要求

客户端两条更新通道：electron-updater 6.8.9 整包（generic provider）+ 自研 asar 热更。
两通道共用按应用区分的 feed 基地址，部署时经环境变量 `DESKTOP_UPDATE_FEED` 注入
（如 `https://api.xxx.com/update/desktop`）。

**契约硬要求的只有整包清单与产物下载两类 GET**；热更清单的路由、方法、格式完全自由；
无上报回调。客户端拉取时机：启动 + 手动检查，无轮询。主进程请求：无需 CORS。

## 接口总览

```
GET https://api.xxx.com/update/{app}/latest.yml   ← 整包清单（路径结尾 /latest.yml 为客户端硬约束，前缀任意；可为动态接口，不要求磁盘文件）
GET <热更清单地址>                                 ← 热更清单：路由与格式不做契约要求（见下文，唯一要求是结果正确）
GET <path/url 字段指向的地址>                       ← 安装器 / 热更 zip 字节流（可托管外部存储，不要求与清单同域）
```

## 发布记录模型（同一记录 → 两份清单视图）

单一发布记录动态生成两份清单，字段映射：

| 记录字段 | 说明 | → 整包清单 | → 热更清单 |
|---|---|---|---|
| `version` | 发布版本（合法 semver） | `version` | `version` |
| `installerUrl` | 安装器地址 | `path` | — |
| `installerSha512` | 安装器 SHA-512（base64），上传时服务端计算落库 | `sha512` | — |
| `asarZipUrl` | 热更 zip 地址（可空） | — | `url` |
| `releaseDate` | 记录激活时间 | `releaseDate` | 可选 |
| `changelog` | 更新内容（可空） | `releaseNotes` | 可选 |

- `installerSha512` 纯热更发布时为空；`asarZipUrl` 纯整包发布（未含热更包）时为空。
- 各清单取**最新非空记录**生成；**激活记录即清单原子翻转**（动态生成无中间态，无静态托管的发布时序问题）。

## 整包清单（GET /latest.yml）

响应体 **JSON 或 YAML 均可**（JSON 是 YAML 子集，6.8.9 自带 js-yaml 实测解析通过）：

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
| `path` | 是 | 安装器下载地址，**推荐绝对 URL**（可指向外部存储，不要求与清单同域）；备选：后端对安装器路由 302 重定向（Electron 网络栈默认跟随），或安装器与清单同前缀以相对文件名提供 |
| `sha512` | 是 | base64（非 hex），上传时服务端计算。**功能性必需**：缺失时客户端缓存校验恒失配、每次全量重下（6.8.9 源码实证） |
| `releaseDate` | 是 | ISO 8601，取记录激活时间 |
| `releaseNotes` | 否 | 更新内容（表 changelog），客户端 UI 展示 |

## 热更清单（路由与格式不做契约要求）

热更为自研更新逻辑，**接口自由**：路由、方法（GET/POST）、响应格式均由各 app 的适配器
（`UpdateAsarSource.endpoint + transform`）与后端自行约定。后端唯一需要保证的：
**版本数据可获取、zip 可下载、结果正确**。默认/建议形状（与客户端零适配的字符串清单模式配套）：

```json
{ "version": "1.4.3", "url": "https://files.xxx.com/desktop/core-1.4.3.zip" }
```

热更包为**自描述 zip**（sha256 / 包内文件名 / 资源门槛全部随包下发，服务器零维护）：

```
core-<版本>.zip
├── update.json                ← { "version", "file", "sha256", "minResourcesVersion"? }
└── core-<版本>.asar           ← 条目名由 update.json.file 声明
```

`update.json` 字段：

| 字段 | 必须 | 说明 |
|---|---|---|
| `version` | 是 | 包内热更版本，须与外部清单 `version` 一致，不一致视为服务器配置错误 |
| `file` | 是 | zip 内 asar 条目文件名 |
| `sha256` | 是 | zip 内 asar 条目的 SHA-256，64 位小写 hex；客户端解包后强校验，不一致即丢弃 |
| `minResourcesVersion` | 否 | 资源配对要求：热更代码依赖新版 resources（厂商 DLL/内置页面/SumatraPDF）能力时必填。客户端发现本机 resources（安装期整包版本）旧于该值则跳过热更（blocked 状态），等待整包更新先行。**缺省 = 不设限，旧包天然兼容** |

## HTTP 行为要求

- **`Cache-Control: no-cache` 必须作用于两个清单**——否则 CDN/网关缓存导致发版后客户端长时间读旧清单；带版本号的文件本体可长缓存（内容永不变更）
- 安装器 / 热更 zip 返回 `Content-Length`（进度条依赖）
- 无激活记录返回 **404**（客户端按无更新容错）
- **HTTPS 为部署建议而非硬要求**：HTTP 部署由部署方知情接受风险（sha256/sha512 只防损坏不防篡改，清单真实性依赖传输层）
- **鉴权（标准能力，按需启用）**：整包通道由客户端支持传入静态授权请求头（electron-updater 约束，仅静态 header；token 经 `DESKTOP_UPDATE_TOKEN` 注入，未配置不带头，清单与安装器下载同时生效）；热更通道由适配器实现（支持静态 method/headers/body，更复杂的鉴权逻辑直接写在适配器代码内），无此限制
- **无需 CORS**（客户端主进程请求，不受同源策略约束）
- **无需 Range/断点续传**（整包通道的差量下载依赖 blockmap 存在）
- **可选增强**：接收 blockmap（上传 `.blockmap` 客户端自动启用差量，缺失自动全量，客户端零改动）；按设备/百分比返回不同 version（灰度，客户端零改动）

## 发布纪律（发布管理端执行并校验）

1. 上传产物 → 服务端计算**安装器** sha512 落库（热更 zip 的 sha256 在打包时写入包内 update.json，后端无感）→ **激活记录即清单原子翻转**。
2. 已发布版本内容不可变；修正问题 = 发布更高版本。
3. **热更 version 严格大于该应用线上所有已发布版本**；**整包 version 必须大于线上最高热更 version**（违反则已装热更设备白下载且整包被热更压制）。建议发布端保存时校验拦截。
4. 回滚 = 发布更高 version 携带旧包。
5. 客户端版本比对基准 = 安装期版本（`app.getVersion()`，来自引导器打包元数据）；热更不改变它。客户端对 `<=` 生效版本的清单直接忽略（同号重发不同内容不会被消费）。

## 客户端容错（无需服务器配合处理）

清单 404 / 解析失败 / 下载中断 / 校验不一致 → 记日志、界面错误状态，不崩溃、不重试风暴，
下次启动自然重试。热更包校验不通过不会写入生效指针；blockmap 缺失自动回退全量下载。

## 本地联调

```bash
pnpm hotfix <app> --version 1.0.1          # 产出 dist/hotfix/{core-*.zip, asar-manifest.json}
pnpm exec tsx scripts/e2e-update-server.ts <app>   # 本地供流服务器（asar + latest.yml）
pnpm exec tsx scripts/e2e-packaged.ts <app> --hot  # 树外打包冒烟（含热更闭环）
```

Spring Boot 动态生成清单的参考实现与发布管理端设计，见团队内部对接纪要。
