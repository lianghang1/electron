# 更新服务器契约

与 `master` 的差别：`master` 用 electron-updater 6.8.9 的 `latest.yml` 整包清单 + 独立热更清单；`next` 收敛为**单份 `UpdateManifest` JSON**，三通道各取所需，无上报回调。契约源码：`packages/update/src/manifest.ts`、`packages/update/src/boot/bundle.ts`、`packages/update/src/boot/pointer.ts`。

## 清单格式

一个 GET 地址返回一份 JSON，缺省段表示该通道无更新：

```json
{
  "minVersion": "2.0.0",
  "apps": {
    "demo": {
      "version": "1.2.3",
      "url": "https://update.example.com/apps/demo-1.2.3.zip",
      "sha256": "<64 位小写十六进制>"
    }
  },
  "asar": {
    "version": "2.1.0",
    "url": "https://update.example.com/core-2.1.0.zip",
    "sha256": "<64 位小写十六进制>",
    "minResourcesVersion": "2.0.0"
  },
  "package": {
    "version": "2.1.0",
    "artifacts": {
      "win32": { "url": "https://update.example.com/win32/x64/setup.exe", "sha256": "<...>" },
      "darwin": { "url": "https://update.example.com/darwin/arm64/app.dmg", "sha256": "<...>" },
      "linux": { "url": "https://update.example.com/linux/x64/app.deb", "sha256": "<...>" }
    }
  }
}
```

| 字段 | 必填 | 规则 |
|---|---|---|
| `minVersion` | 否 | 生效业务版本低于它即阻断启动（强制更新门禁） |
| `apps.<id>` | 否 | `version` / `url` / `sha256`；dist 热更，免重启 |
| `asar` | 否 | 同上 + 可选 `minResourcesVersion`；主程序代码热更，需重启 |
| `package.version` | 否 | 整包版本，三平台共用 |
| `package.artifacts` | 否 | key 为 `BuildPlatform`（`win32` / `darwin` / `linux`）；设备只取自己平台条目，缺失即跳过整包更新 |

所有 `url` 必须是合法 URL 且落在 `flavor.update.allowedOrigins` 白名单内；`sha256` 必须是 64 位十六进制。整包条目**只描述去哪下载、怎么校验**，落地命令模板内建在各平台 `PackageInstaller` 里，服务端清单一旦能带 argv 就能让设备执行任意程序。

## 安全边界

- `allowedOrigins` 为空数组时所有更新 URL 一律拒绝（fail-closed）；支持 `*.example.com` 通配。
- `assertFetchableUrl` 拒绝内网 / 本机地址，防 SSRF。
- 下载后对文件做 sha256 强校验，不一致即丢弃；不引入公钥签名。
- 安全模型是 `HTTPS + 源站白名单 + 内容摘要`，与 master 源码一致。
- **中断安全**：任何写入先进 staging 目录，校验通过才原子换名；断电落在任一状态都有可运行版本。dist 热更以 `.old-*` 备份 + 原子 rename + 失败回滚实现。

## 下载行为

`net.ts` 支持 Range 断点续传：仅当服务端返回 `206` 且 `Content-Range` 起点恰好等于本地已有字节数时才追加，否则（200 全量或忽略 Range）整文件重写，避免拼出损坏包。取消进行中的下载经 `AbortSignal`；解压与指针写入属于原子收尾，不可中断。

## asar 热更包

自描述 zip，服务端零维护：

```
core-<版本>.zip
├── update.json   { "version", "file", "sha256", "minResourcesVersion"? }
└── core-<版本>.asar
```

- `update.json.file` 声明 zip 内 asar 条目名；只对该条目字节做 sha256 强校验。
- 包内 `version` 必须与外部清单 `asar.version` 一致，不一致视为服务器配置错误。
- `minResourcesVersion` 高于本机 `.resources-version` 时拒绝应用，等整包更新先行——热更代码不能跑在更旧的原生资源上。
- 落盘用版本化终名 `core-<version>.asar`，下载即终名，引导层永不 rename。

## 指针与判活

工作目录 `userData/desktop-updater/`（引导器与主进程的跨版本契约目录，不可改名）：

| 标记 | 作用 |
|---|---|
| `pending` | 校验通过待切换的 core 包，写指针成功后才清除 |
| `current` | 生效包版本与文件名（`current.json`） |
| `first-run` | 新版本冷启动标记，存活满 60s 视为稳定 |
| `graceful-exit` | 主动重启标记，区分「崩溃重载」与「正常重启」，避免正常版本被误回滚 |

引导层在 `app.ready` 前执行 `applyPending` → 写 `current` + `first-run`；主进程稳定后 `settle` 清除首启标记。若首启标记仍在（进程没活到稳定点），删除坏包并回到内置 `app.core.asar`。

**`app.getVersion()` 恒为薄壳出厂版本**：`shell:info`、强制更新门禁、更新状态机的「当前版本」一律从指针取业务版本。dist 热更用 `apps-current.json` 指针，`app://` 协议根与 `resolveAppRoot` 跟随指针。

## 三通道

| 通道 | 生效方式 | 落地位置 | 平台差异 |
|---|---|---|---|
| `dist-hot` | 免重启 | `userData/desktop-updater/apps/<appId>-<v>/` | 无，原子换名 + 指针 |
| `asar-hot` | 重启生效 | `userData/desktop-updater/core-<v>.asar` | 无，指针切换 |
| `full-package` | 退出交接 | 暂存后拉起安装器 | `Win32Installer` / `DarwinInstaller` / `LinuxInstaller` 查表注入 |

`UpdateCenter` 一轮巡检最多连续应用 8 个免重启更新；命中需重启的通道后立即停下，等下一次启动生效。状态快照经 `update.state-changed` 推送。

## 拉取时机与客户端桥面

启动延迟 1 分钟巡检一次 + 每 6 小时定时巡检 + 手动触发（`shell:update-now` / `update:install`）。无轮询上报、无回调接口。

| 桥面 | 说明 |
|---|---|
| `update.state()` | 查询进度 / 取消按钮 / 重启提示的状态快照 |
| `update.cancel()` | 取消进行中的下载 |
| `update.install()` | 仅工作台可调用；有待重启更新时优先重启，否则巡检并应用 |

事件：`update.state-changed`、`update.checked`、`update.applied`、`update.failed`、`update.restart-required`、`update.force-required`。更新就绪提示走原生浮层（`update-prompt`），避免被 WebContentsView 遮挡。
