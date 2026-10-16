# 更新服务器对接要求

客户端两条更新通道（asar 热更 + electron-updater 整包）**共用一个 feed 基地址**，
部署时通过环境变量 `DESKTOP_UPDATE_FEED` 注入（如 `https://updates.xxx.com/desktop`）。
两条通道均为纯静态文件下载：无动态接口、无鉴权请求、无上报回执。

每个应用独立一个 feed 目录（清单文件名固定相同，不可共用）：

```
<feed基地址>/
├── asar-manifest.json                     ← 通道一清单
├── core-<版本>.zip                        ← 通道一热更包（自描述 zip：update.json + core-<版本>.asar）
├── latest.yml                             ← 通道二清单（electron-updater generic）
├── <应用名>-Setup-<版本>.exe              ← 通道二完整安装器
└── <应用名>-Setup-<版本>.exe.blockmap     ← 通道二差量索引（可选，建议上传）
```

## 通道一：asar 热更

**GET /asar-manifest.json** → 200 + JSON（仅承载"取包"信息）：

```json
{
  "version": "1.0.1",
  "url": "./core-1.0.1.zip"
}
```

| 字段 | 必须 | 说明 |
|---|---|---|
| `version` | 是 | 热更版本，数字段比较；**必须严格大于**线上所有已发布版本 |
| `url` | 是 | 热更包 zip 下载地址，相对清单 URL 解析（也支持绝对地址，可托管到 CDN），扩展名必须 `.zip` |

**GET <url>** → 200 + 热更包 zip 原始字节（`Content-Length` 建议返回，进度条依赖）。

热更包为**自描述 zip**（校验元数据随包下发，服务器零维护）：

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
| `minResourcesVersion` | 否 | 资源配对要求：热更代码依赖新版 resources（厂商 DLL/内置页面/SumatraPDF）能力时必填。客户端发现本机 resources（安装期整包版本）旧于该值则跳过热更，等待整包更新先行。**缺省 = 不设限，旧包天然兼容** |

**发布顺序**：先上传 `core-<版本>.zip`，最后覆盖 `asar-manifest.json`（顺序颠倒会导致一个更新周期的 404，客户端下次启动自动重试）。

## 通道二：整包更新（electron-updater generic）

**GET /latest.yml** → 200 + YAML（最小可用格式，已实测）：

```yaml
version: 1.0.1
path: Desktop-1.0.1-x64.exe
sha512: <安装器文件 SHA-512，base64 编码>
releaseDate: '2026-10-11T03:00:00.000Z'
```

**GET /<path>** → 200 + 安装器字节。
**GET /<path>.blockmap**（可选）：缺失时客户端自动回退全量下载。

**发布顺序**：先上传 exe + blockmap，最后覆盖 `latest.yml`。

## HTTP 行为要求

- **无需 CORS**（客户端主进程请求，不受同源策略约束；本地实测无 CORS 头通过）
- **无需鉴权**（客户端不带凭证；加鉴权需客户端配合改造）
- **`Cache-Control: no-cache` 必须作用于两个清单文件**——否则 CDN/网关缓存导致发版后客户端长时间读旧清单；带版本号的文件本体可长缓存（内容永不变更）
- `Content-Length` 建议返回（进度条）
- 无需 Range/断点续传（整包通道的差量下载依赖 blockmap 存在）
- **生产必须 HTTPS**：sha256/sha512 只防损坏不防篡改，清单真实性依赖传输层

## 版本纪律

1. **只增不减**：客户端本地有版本比对（`<=` 生效版本即忽略清单），同号重发不同内容不会被消费；回滚 = 发布更高版本携带旧包
2. 版本基准 = 客户端安装期版本（`app.getVersion()`，来自引导器打包元数据）；热更不改变它
3. 热更版本与整包版本建议同步推进（`pnpm hotfix --sync-version` 自动写回 package.json）
4. 客户端拉取时机：启动时 + 手动检查，无轮询

## 客户端容错（无需服务器配合处理）

清单 404 / 解析失败 / 下载中断 / 校验不一致 → 记日志、界面错误状态，不崩溃、不重试风暴，下次启动自然重试。热更包校验不通过不会写入生效指针。

## 本地联调

```bash
pnpm hotfix <app> --version 1.0.1          # 产出 dist/hotfix/{core-*.zip, asar-manifest.json}
pnpm exec tsx scripts/e2e-update-server.ts <app>   # 本地供流服务器（asar + latest.yml）
pnpm exec tsx scripts/e2e-packaged.ts <app> --hot  # 树外打包冒烟（含热更闭环）
```

Spring Boot 动态生成清单的参考实现与发布管理端设计，见团队内部对接纪要；纯静态托管
（Nginx/OSS + CI 上传）同样满足契约——服务器只需保证上表 4 个 GET 的路径、字节与缓存头。
