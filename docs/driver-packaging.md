# 驱动包化（设备资产跟着驱动走，不进 app resources）

## 原则

厂商 SDK（DLL/SO/license）**跟着驱动走**：每个厂商 SDK 一个私有 npm 包，
壳与业务代码对驱动资产零感知。`resources/devices/` 不再进入源码管理与手工维护。

## 包结构约定

```
@device-sdk/idcard-huashi/
├── package.json          # name / version / 授权到期时间写在 description
├── README.md             # 授权信息、适配平台、驱动版本
└── win64/                # 平台目录（与 PlatformCapability.platform 对应）
    ├── xxx.dll
    ├── xxx.lib
    └── license.dat
```

## 分发方式（三阶段）

| 阶段 | 做法 |
|---|---|
| 现在（bundled） | 驱动包进 `dependencies`，electron-builder `extraResources` 从 `node_modules/@device-sdk/*` 复制到 `resources/devices/`（见 apps/shell/electron-builder.yml） |
| 规模化（on-demand） | SDK 体积大的不进安装包：首次使用某设备域时从驱动中心下载 → 签名校验 → 存 `platformDataRoot()/devices/`，`resourcesRoot` 指向运行时目录 |
| 信创（manual） | `PlatformCapability.driverDeployment = 'manual'`：现场部署到数据目录，asset-audit 启动对账 |

## 对账（asset-audit）

`packages/devices/src/host/asset-audit.ts` 启动时校验：`PLATFORM_CAPABILITIES[p].availableDomains`
声明 × 驱动资产目录一一对应——**新增信创平台 = 加一行能力配置 + 一个驱动包，零业务代码改动**。
