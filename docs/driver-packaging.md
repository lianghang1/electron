# 驱动资产寻址（跟着驱动走，不埋在源码产物里）

## 原则

厂商 SDK（DLL / SO / license）的**唯一事实源在源码树**：
`packages/devices/src/domains/<域>/[vendors/]<厂商>/assets/<平台>/<文件>`。

运行时寻址不是硬编码路径，而是 **逻辑声明 → DriverResolver 策略 → 绝对路径**：

```
域内声明  devices/idcard/huashi/win64/Termb.dll
    ↓  (assetRoot + 声明，assetRoot 由组合根按能力表注入)
bundled  <resources>/devices/idcard/huashi/win64/Termb.dll
manual   <userData>/platform/resources/devices/idcard/huashi/win64/Termb.dll
system   不随包携带（系统驱动），present() = false，原生域降级 unavailable
```

域内部只认一个 `assetRoot` 字符串，dev / 打包 / 现场部署三种根的差异全部收敛在组合根
（铁律一）+ `DriverResolver`（铁律二），域代码零 `process.platform` / `app.isPackaged` 分支。

## 三种部署方式（PlatformCapability.driverDeployment）

| 方式 | 平台 | 资产来源 | 策略 |
|---|---|---|---|
| `bundled` | win32 | 构建期聚合注入 `resources/devices/` | `BundledDriverResolver` |
| `system` | darwin / linux | 系统打印驱动，无 DLL | `SystemDriverResolver` |
| `manual` | linux-cn / arm64 / loongarch64 | 现场部署到 `platformDataRoot()/resources/devices/` | `ManualDriverResolver` |

新增平台 = `PLATFORM_CAPABILITIES` 加一行，零业务代码改动。

## 构建期聚合（规则唯一）

`scripts/prepare-driver-assets.mjs` 调用 `planDriverAssets()`（`@shell/devices`，
与 `asset-audit` 共用 `collectAssetSources`）生成聚合计划，把源码树 assets 复制到
`resources/devices/<域>/<厂商>/<平台>/<文件>`。

- 幂等：先清再建；`build:*`（经 `electron-builder.config.mjs` 顶层）与 `pnpm dev` 均自动触发
- `resources/devices/` 是构建产物，已 `.gitignore`，不入库
- `electron-builder` 的 `extraResources` 把它注入安装包的 `resources/devices/`

**单一规则**：声明格式 `devices/<域>/<厂商>/<平台>/<文件>` ↔ 聚合产物布局 ↔
`asset-audit` 对账，三处共用 `collectAssetSources` 推导，不存在第二套目录规则。
目录名打错 / SDK 漏放由 `auditDeviceAssets()` 对账暴露。

## 真机边界

DLL 协议帧（汉王签名回调、capture ws、IPP 通道）仍需真机验证，代码里标为
`PROTOCOL_PENDING` / 预留扩展点，不假装完成。Windows 文件锁下的 asar 热更亦待真机实测。
