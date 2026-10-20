# 设备体系规范（packages/core/src/devices）

设备域统一架构：**传输基座（kernel）→ 域适配器（adapters）→ 厂商模块（vendors/drivers）→ 守护进程（host）**。
品牌差异在配置数据，接入方式差异在适配器代码，厂商协议差异在厂商模块，全部 native 调用收敛在守护进程。
新增厂商必须遵守以下约定，禁止绕过基座手写连接管理。

## 目录职责

```
devices/
├── kernel/channel/     传输基座（写一次，全域复用）：ws-channel / http-channel / channel-types
├── platform/           平台能力面：detectDevicePlatform() 单点探测（windows/mac/linux/linux-cn）
├── host/               设备守护进程（utilityProcess）：koffi 调用全部在此进程，崩溃退避自愈
│   ├── run.ts          域方法表注册制：域接入 = registerDomainMethods('<域>', {...}) 一处
│   └── asset-audit.ts  SDK 资产对账：代码声明 ↔ assets 源资产（同步脚本与单测共用）
├── <域>/adapters/      接入方式适配器：按 transport 路由（ws/dll/service/wia...）
└── <域>/vendors/       厂商模块：一个厂商 = 一个模块文件 + 注册表一行 + assets/ SDK 资产
```

## SDK 资产约定（devices/**/assets/）

- 厂商 SDK 二进制（DLL/license/SumatraPDF）是驱动代码的随仓资产：放 `<域>/vendors/<厂商>/assets/<平台>/`
  （print 无厂商层，直接 `print/assets/<平台>/`），**assets 的父目录名 = 厂商名**，与驱动类同目录演进；
- 驱动声明路径格式统一 `devices/<厂商>/<平台>/<文件>`（如 `devices/huashi/win64/Termb.dll`），
  相对宿主资源根（dev = `<应用根>/resources/`，打包 = `<resourcesPath>/resources/`）；
- 各应用 `resources/devices/` 是 `scripts/sync-dev-resources.ts`（postinstall 自动跑）覆盖式重建的
  **生成物，禁止手放文件、gitignore**——同步前先跑 asset-audit 对账，目录名打错 / SDK 漏放 /
  孤儿厂商目录直接报错终止；`pnpm test` 里 asset-audit.test.ts 同规则兜底；
- 新增信创平台 = 厂商 assets 下加 `linux-arm64/` 等平台目录 + 驱动按 `detectDevicePlatform()` 选文件，
  同步链路零改动。

## 新厂商接入指南

### WS 厂商（协议走 WebSocket，如华视 CamSDK / 点易拍）

1. `kernel/channel/ws-channel.ts` 的 `withWsSession` 写会话逻辑（连接/超时/收尾内置），禁止手写 `new WebSocket` 生命周期；
2. 厂商模块实现所在域的 Vendor 契约（如 `capture/vendors/vendor-types.ts` 的 `CaptureVendor`），
   入参出参一律域统一类型，协议帧编解码内聚在模块内；
3. 域注册表加一行（如 `capture/vendors/registry.ts` 的 `CAPTURE_VENDORS`）；设备配置 `ws.protocol` 填 vendorId。

### DLL 厂商（C 接口 SDK，koffi 直调）

1. idcard/iccard 形状：`idcard/vendors/`（身份证）/ `iccard/vendors/`（IC 卡）新增驱动类
   （纯 koffi 调用，参照 huashi/kemi/decard），`host/run.ts` 对应域驱动注册表（ID_DRIVERS/IC_DRIVERS）
   加一行；设备 capabilities 按域语义生成（idcard 域恒 'idcard'，iccard 域按写卡能力补 'iccard-write'）；
   SDK 二进制放驱动类同目录 `assets/win64/`，dllFile 声明 `devices/<厂商>/win64/<DLL>`（asset-audit 强校验）；
2. capture/signature 形状：厂商协议档案放对应域 `vendors/`，在 `host/run.ts` 域方法表补方法；
3. 全部 koffi 调用必须在守护进程域方法内执行（`DeviceHost.request`），主进程/适配器零 native 依赖；
4. 调用约定与结构体出参：cdecl/stdcall 以厂商文档为准；koffi 结构体指针解码不可用，
   指向缓冲区内部的指针用 `koffi.address` 换算偏移后 Buffer 手工解析。

### HTTP 厂商（REST 接口，如服务商模式采集）

1. 探活用 `kernel/channel/http-channel.ts` 的 `probeHttp`，请求用 `httpRequest`，禁止手写 fetch 超时包装；
2. 参照 `capture/adapters/service-adapter.ts` 的薄路由形状。

## 探测与错误语义

- 平台不支持 / DLL 缺席 / koffi 缺失 → 设备状态 `unavailable` / `offline` + `meta.note` 说明原因，**不抛错、不伪装 ready**；
- native 守卫统一走守护进程内 `nativeAvailability()`（`platform.detectDevicePlatform` + koffi 可用性），idcard/iccard/capture 探测共用；
- 查询失败显式上报，禁止回落默认数据伪装成功（纸型探测等硬件数据尤其严格）；
- 未知 method / 未注册厂商抛结构化错误（带 code），禁止静默吞掉。

## 平台约束

- 平台判断一律经 `devices/platform` 的 `detectDevicePlatform()`，禁止散写 `process.platform === 'win32'`；
- 厂商 SDK 的 OS 覆盖是商务问题（多数仅 Windows），非 native 平台设备置 unavailable 即可，结构已预留；
- ws/http 通道天然跨平台，不受 native 约束。
