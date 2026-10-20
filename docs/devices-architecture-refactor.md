# 设备体系整体重构方案

> 目标：多对接方式（dll/ws/http/未来）× 同域多厂商 × 多操作系统，顶层封装、注册扩展、统一入参出参。
> 原则：不引入新依赖；现有生产链路（华视 ws 拍照、德卡读卡、系统打印）行为不变，只换底座。

## 一、现状盘点

### 1.1 已有的优质资产（保留并推广）

| 资产 | 位置 | 价值 |
|---|---|---|
| DeviceHost 守护进程 | `core/src/devices/host/device-host.ts` | utilityProcess 承载全部 native 调用：懒启动、RPC 配对、30s 超时、崩溃退避自愈。**这就是「dll 基座」**，但当前只有 idcard 在用 |
| 驱动注册表 | `host/run.ts` 的 `DRIVERS` | 厂商接入 = 驱动类 + 注册表一行（华视/德卡/科密三驱动已按此接入） |
| BrandDriver 契约 | `idcard/types.ts` | 厂商驱动类统一形状：dllFile/dllPresent/open/close + 能力方法 |
| 域统一类型 | `shared/src/types/devices/*.ts` | 每域统一入参出参（CaptureResult/IdCardData/SignStroke…）已成型 |
| 热重建 + 串行锁 | `capture/service.ts` | setConfig → persist → 适配器重建；同设备采集串行化 |
| 统一设备视图 | 各域 `*Device` 类型 | id 约定 `<transport>:<键>`、status 三态（ready/offline/unavailable）全域同构 |

### 1.2 碎片化问题（本次重构对象）

| # | 问题 | 具体位置 |
|---|---|---|
| P1 | WS 会话逻辑两套：点易拍二进制帧编解码内联在 ws-adapter；华视会话独立在 camsdk-session | `capture/adapters/ws-adapter.ts` L191-248、`camsdk-session.ts` |
| P2 | DLL 三域三套且未接入守护进程：idcard 走 DeviceHost（最佳实践）；capture 的 DllAdapter 进程内骨架空转；signature 骨架同 | `idcard/adapters/dll-adapter.ts` vs `capture/adapters/dll-adapter.ts` vs `signature/adapters/dll-adapter.ts` |
| P3 | 守护进程 dispatch 为 idcard 专属方法表，print.winspool 两方法硬塞其中，无法承接其他域 | `host/run.ts` L120-155 |
| P4 | HTTP 探活/请求逻辑散装 | `capture/adapters/service-adapter.ts`（fetch + AbortController 手写） |
| P5 | 厂商差异埋在 adapter 内部 switch（capture），不是可注册的厂商模块 | `ws-adapter.ts` L128-130、L165 |
| P6 | 平台分支散装：winspool 在 print/、koffi 平台判断在 idcard/drivers/koffi.ts | 无统一 platform 抽象 |

### 1.3 明确不动的东西

- **print 的 `channels/`（PrintChannel/system/ipp）**：它是「任务提交路由」语义，不是设备连接语义，与 kernel 的 Channel 概念不同，保持独立（避免过度抽象）。
- **UVC 路线**：渲染进程 getUserMedia 直拍，不经设备 service，维持现状。
- **scanner（键盘仿真扫码枪）**：HID 事件流监听，无连接会话语义，维持现状。
- **各域错误码表、统一类型、配置持久化（createDeviceStore）、IPC 契约**：全部保留，对外 API 零变化。

## 二、目标架构

### 2.1 分层与调用链

```
页面 / IPC
   │
域 Service（统一入参出参 · 热重建 · 串行锁 · 域错误码）          ← 各域保持现状语义
   │
Adapter（薄）：按 transport 选 Channel，按 config 选 Vendor      ← 收编差异路由
   │
├─ VendorModule（厂商模块）：纯厂商差异（协议帧编解码 / DLL 签名档案）   ← 新厂商只写这个
├─ Channel（传输基座）：ws / http / native 三种，连接·配对·超时·释放全内置 ← 一次写好永久复用
└─ Platform（平台层）：win / mac / linux / 国产化，OS API 差异收口     ← 预留注册制
```

### 2.2 目录结构（目标态）

```
packages/core/src/devices/
├── kernel/                              ★ 新增：跨域共享基座
│   ├── channel/
│   │   ├── channel-types.ts             Channel 统一契约 + 状态机
│   │   ├── ws-channel.ts                WS 基座（帧编解码器注入、请求配对、探活、超时、释放）
│   │   ├── http-channel.ts              HTTP 基座（探活、请求、超时）
│   │   └── native-channel.ts            Native 基座 = DeviceHost 泛化引用（守护进程 RPC）
│   ├── vendor/
│   │   └── vendor-types.ts              VendorModule 注册契约（按域泛型）
│   └── platform/
│       ├── platform-types.ts            平台实现注册契约
│       ├── windows.ts / mac.ts / linux.ts
│       └── index.ts                     detectPlatform()（含国产化 UOS/麒麟探测预留）
├── host/                                守护进程（NativeChannel 的子进程侧）
│   ├── device-host.ts                   保留，微调（方法表来源改为注册）
│   ├── run.ts                           ★ 改造：idcard 专属 dispatch → 域方法表注册制
│   └── protocol.ts                      保留
├── capture/
│   ├── service.ts                       保留
│   ├── adapters/
│   │   ├── ws-adapter.ts                ★ 瘦身：WsChannel + vendor 注册表路由（P1/P5 收敛）
│   │   ├── dll-adapter.ts               ★ 改造：走 NativeChannel（守护进程内执行，P2 收敛）
│   │   ├── service-adapter.ts           ★ 瘦身：HttpChannel 替代手写 fetch（P4 收敛）
│   │   └── wia-adapter.ts               保留
│   └── vendors/                         ★ 新增：capture 厂商模块
│       ├── vendor-types.ts              CaptureVendor 契约（listCameras/openPreview/captureOnce）
│       ├── registry.ts                  CAPTURE_VENDORS 注册表
│       ├── camsdk.ts                    华视 CamSDK（自 camsdk-session/preview 平移）
│       └── dianyipai.ts                 点易拍 BaucheSDK（自 ws-adapter.captureBase64 平移）
├── idcard/
│   ├── drivers/ → 保留原位              BrandDriver 即 vendor 模块，契约已达标，仅命名对齐
│   └── adapters/dll-adapter.ts          保留（已是薄代理范式）
├── signature/
│   ├── adapters/dll-adapter.ts          ★ 改造：走 NativeChannel（PROTOCOL_PENDING 语义保留）
│   └── vendors/hanvon.ts                ★ 新增：协议确认后填原生调用（现 only 就位检测平移进来）
├── print/
│   ├── channels/                        保留（任务路由语义，不并入 kernel）
│   └── winspool-forms.ts                保留原位，platform 层引用它
└── scanner/                             保留
```

### 2.3 核心契约（代码级定案）

**Channel 统一契约**（kernel/channel/channel-types.ts）：

```ts
export type ChannelKind = 'ws' | 'http' | 'native'

/** 传输基座统一契约：连接管理/请求配对/事件流/探活/释放，全部内置一次实现 */
export interface Channel {
  readonly kind: ChannelKind
  /** 幂等就绪：ws=建连、native=懒启动守护进程、http=无（探活时按需） */
  ensureReady(): Promise<void>
  /** 请求-响应：配对与超时内置（ws 按会话语义、native 按 requestId、http 按 fetch） */
  request<T>(method: string, payload?: unknown): Promise<T>
  /** 事件流订阅（预览帧/笔迹点/推送），返回退订函数 */
  onEvent(handler: (event: unknown) => void): () => void
  /** 轻量探活：不建立完整会话（ws=tcp 探测、http=GET、native=koffi/DLL 就位） */
  probe(): Promise<boolean>
  dispose(): void
}
```

**VendorModule（capture 例，其他域同构）**（capture/vendors/vendor-types.ts）：

```ts
/** capture 厂商模块契约：入参出参全是域统一类型，差异止步于本模块内部 */
export interface CaptureVendor {
  readonly vendorId: string
  /** 枚举摄像头与分辨率 */
  listCameras(ch: Channel, config: CaptureDeviceConfig): Promise<CaptureCameraInfo[]>
  /** 开启常驻预览（返回会话句柄，含会话内拍照能力） */
  openPreview(ch: Channel, config: CaptureDeviceConfig, opts: PreviewOptions, onFrame: (base64: string) => void): Promise<CapturePreviewSession>
  /** 一次性拍照（无预览会话时）：连接 → 采集 → 释放 */
  captureOnce(ch: Channel, config: CaptureDeviceConfig, req: AdapterCaptureRequest): Promise<string>
}
```

**新厂商接入成本定案**（呼应顶层封装要求）：

| 场景 | 接入动作 | 零改动范围 |
|---|---|---|
| WS 协议新厂商 | `vendors/` 加一个 CaptureVendor 文件 + 注册表一行 + 配置条目 `protocol` 填 vendorId | Channel、adapter、service、IPC、UI |
| DLL 新厂商 | 守护进程内加厂商模块（照 BrandDriver 形状）+ `run.ts` 域方法表注册一行 + 配置条目 | 主进程全部、守护进程基建 |
| HTTP 新厂商 | 配置条目声明 baseUrl/路径/字段（现有 ServiceAdapter 配置驱动已达标） | 全部代码 |
| 新对接方式 | 实现 Channel 接口 + 域 adapter 一个 | 其他域、kernel 其余部分 |

**多 OS 约定**（kernel/platform）：

```ts
export type PlatformId = 'windows' | 'macos' | 'linux' | 'linux-cn'
// linux-cn：国产化（UOS/麒麟），经 /etc/os-release 探测；与 linux 共享实现，仅日志与兼容性标注差异

export interface PlatformNative {
  /** native 库后缀与寻址约定：windows=dll、macos=dylib、linux=so */
  readonly nativeSuffix: 'dll' | 'dylib' | 'so'
  /** 平台探针（winspool 等仅 windows 有实现的，非本平台返回 null 而非报错） */
  queryForms(printerName: string): WinForm[] | null
  queryHardware(printerName: string): HardwareCaps | null
}
```

- ws/http 通道：天然跨平台，零平台代码。
- native 通道：DLL 未就位/平台不支持 → 设备 `unavailable`（note 说明原因），不报错——现状语义保留并统一到 platform 层收口。
- 厂商 SDK 的 OS 覆盖是商务问题（多数厂商仅 Windows），结构预留到位，能跑多少取决于厂商。

## 三、迁移映射表

| 现有代码 | 去向 | 动作 |
|---|---|---|
| `ws-adapter.ts` captureBase64（点易拍帧逻辑 L191-248） | `capture/vendors/dianyipai.ts` | 平移，封装为 CaptureVendor |
| `camsdk-session.ts` + `camsdk-preview.ts` | `capture/vendors/camsdk.ts` | 平移，封装为 CaptureVendor |
| `ws-adapter.ts` tcpProbe/parseWsUrl | `kernel/channel/ws-channel.ts` | 提炼为基座内置 |
| `service-adapter.ts` probe/capture fetch | `kernel/channel/http-channel.ts` | 提炼，adapter 瘦身为配置翻译 |
| `host/run.ts` dispatch（idcard.* + print.winspool） | `host/run.ts`（改造） | 改域方法表注册：`registerDomainMethods('idcard', {...})` |
| `idcard/drivers/*`（BrandDriver 三驱动） | 原位保留 | 零改动（已是目标形态） |
| `capture/adapters/dll-adapter.ts` 进程内骨架 | 原位改造 | koffi 探测改走 NativeChannel，配置驱动签名档案语义保留 |
| `signature/adapters/dll-adapter.ts` 汉王骨架 | 原位改造 + `vendors/hanvon.ts` | 就位检测走守护进程，PROTOCOL_PENDING 保留 |
| `print/winspool-forms.ts` | 原位保留 | platform/windows.ts 引用它（签名不变） |
| `idcard/drivers/koffi.ts` | 原位保留 | platform 层引用（打包/开发态分发逻辑保留） |

## 四、分阶段实施

### Phase 1：kernel 骨架 + capture ws 域收敛（最大痛点先解）

| 批次 | 内容 | 验证 |
|---|---|---|
| 1.1 | kernel/channel：契约 + ws-channel.ts（自 tcpProbe/连接管理提炼）+ http-channel.ts | typecheck + lint |
| 1.2 | capture/vendors/：camsdk.ts、dianyipai.ts、registry.ts（纯平移不改行为） | typecheck |
| 1.3 | ws-adapter.ts 瘦身（路由层化）、service-adapter.ts 换 HttpChannel | **真机回归：点易拍拍照、华视拍照/预览/枚举** |
| 1.4 | kernel/vendor 泛型契约 + platform 骨架（windows 先行） | typecheck |

### Phase 2：native 收编（守护进程全域化）

| 批次 | 内容 | 验证 |
|---|---|---|
| 2.1 | run.ts 域方法表注册制改造（idcard 方法平移，行为零变化） | **真机回归：德卡/华视/科密读卡** |
| 2.2 | capture dll-adapter 接 NativeChannel（配置驱动签名档案在守护进程内执行） | 设备测试页列表状态回归 |
| 2.3 | signature dll-adapter 接 NativeChannel + vendors/hanvon.ts 平移 | 列表状态回归 |

### Phase 3：platform 收口 + 文档

| 批次 | 内容 | 验证 |
|---|---|---|
| 3.1 | platform/windows.ts 收口 winspool/koffi 平台判断；linux/mac 骨架 + 国产化探测 | typecheck + Windows 回归 |
| 3.2 | AGENTS.md 设备章节补「新厂商接入指南」（三表：ws/dll/http 各自步骤） | 评审 |

每批完成即跑 `lint + typecheck`，不通过不进下一批；每阶段末做真机回归（华视 S520-2 + 德卡 D3 + 系统打印机）。

## 五、风险与决策记录

| 风险 | 对策 |
|---|---|
| DeviceHost 30s 超时对 capture 拍照是否够 | 拍照秒级完成，够用；预览帧流不走 RPC（onEvent 推送），不经超时约束 |
| capture native 化后图片 base64 走 RPC（数百 KB） | utilityProcess postMessage 承载无压力；且当前无 capture DLL 厂商上线，链路为未来预留 |
| 重构期间破坏生产链路 | Phase 1 纯平移（行为不变）；Phase 2 每批真机回归；对外 IPC/类型零变化，渲染层无感知 |
| print channels 与 kernel Channel 概念撞名 | 定名区分：kernel 为「设备连接通道」，print 为「任务提交路由」，文档明确 |
| 过度抽象 | 只抽三个 Channel + vendor 注册表，不抽域 service 基类（各域语义差异大，保持同构约定而非继承） |
