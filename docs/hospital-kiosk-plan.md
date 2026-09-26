# 医院自助大屏应用落地清单（apps/hospital）

> 基于 Desktop Platform 的 Kiosk 形态。本文档为实施方案，进度推进时同步更新。

## 一、结论

医院自助机（挂号/缴费/报告打印/导诊）= **Kiosk 形态**的典型场景，框架侧零改动即可获得全部运行底座能力，开发量集中在业务页面与硬件桥接。

## 二、直接复用的平台能力（零改动）

| 能力 | 来源 |
| --- | --- |
| 全屏 kiosk 模式（fullscreen + kiosk + frame:false） | bootstrap browserWindowOptions |
| 开机自启（autoLaunch） | `resilience.autoLaunch` |
| 崩溃自恢复（指数退避 + 熔断） | `resilience.crashReload`（已实杀验证） |
| 防误关机（exitGuard） | `resilience.exitGuard` |
| asar 热更新（几十台机器免人工升级） | 引导器模式，全链路已验证 |
| 操作留痕 | Audit Log（JSONL 按天，30 天保留） |
| 故障排查 | electron-log 分级日志 |
| 业务全放行 | `permissions: 'all'`（自有受信业务） |

## 三、应用骨架（照 kiosk 模式新建）

```
apps/hospital/
├── package.json                # @app/hospital；scripts: dev / build / typecheck
├── electron.vite.config.ts     # createElectronViteConfig() 工厂
├── electron/
│   ├── main/index.ts           # bootstrap：app.id 'com.company.hospital'、
│   │                           #   features.tabs 不配置（默认单应用形态）、
│   │                           #   browserWindowOptions 全屏 kiosk、
│   │                           #   resilience 三项全开、permissions 'all'
│   ├── main/peripherals/       # 硬件外设服务（app 专属，见第四节）
│   │   ├── printer.ts          #   票据打印机（厂商 SDK DLL 加载）
│   │   └── idcard-reader.ts    #   身份证/社保卡读卡器
│   └── preload/index.ts        # 薄壳 re-export '@desktop/core/preload'（约定必须有）
├── src/                        # 业务 UI（Vue），全屏触屏交互
└── tsconfig.json 等
```

- root scripts 增加 `dev:hospital` / `build:hospital`
- dev 冒烟项：全屏启动、autoLaunch dev 跳过日志、renderer 业务页渲染

## 四、硬件桥接 IPC 扩展模式（核心设计）

原则：**不动 preload、不开逃生口**——一切通道走现有契约体系（shared DesktopIpc type alias），这也是 ROADMAP「平台能力扩展 JSSDK 式」的第一个实例。

**四步模式（每加一种外设重复一次）：**

1. **契约**：`packages/shared` 的 DesktopIpc 增加 App 外设段（`hospital:` 前缀，invoke 函数形态）：
   ```ts
   // (...) => result = invoke
   'hospital:printer:print': (content: PrintTicket) => Promise<void>
   'hospital:idcard:read': () => Promise<IdCardInfo>
   ```
   preload 用裸 invoke + satisfies 校验 channel——契约加段后 **preload 与 renderer 的 window.desktop 类型自动获得新方法，两端零改动**。
2. **Main 服务**：`apps/hospital/electron/main/peripherals/` 实现 SDK 调用（node ffi / child_process 调厂商 demo 程序 / SDK 自带 Node binding，按厂商实际形态定）。
3. **注册扩展点（唯一框架改动）**：core 直接导出 `handle` 原语（`export { handle } from './ipc/handle'`，比包一层 registerAppIpc 更轻）——channel 同样受契约约束、复用既有类型化包装，app 在 bootstrap 后自行调用注册。外设通道不进 CallerResolver 强校验（kiosk 单应用形态 renderer 即自身；后续如需隔离再收紧）。
4. **权限**：外设通道不涉及 session guard（不是 Chromium 权限），由「仅自有业务代码可调用」保证（renderer 无 nodeIntegration）。

**按设备的成本分层：**

| 设备 | 方案 | 成本 |
| --- | --- | --- |
| 扫码枪 | USB HID 键盘模拟，renderer 直接监听输入流，**零桥接** | 极小 |
| 摄像头/人脸 | `permissions: 'all'` 下 getUserMedia 直接可用 | 小 |
| 票据打印机 | 厂商 SDK → Main 服务 + 契约通道 | 中 |
| 身份证/社保卡读卡器 | 厂商 SDK（DLL）→ Main 服务 + 契约通道 | 中 |

## 五、分阶段落地清单

| 阶段 | 内容 | 验收标准 |
| --- | --- | --- |
| 1. 骨架 ✅ | apps/hospital 新建（照 kiosk）、root scripts、业务 UI 占位页 | dev 冒烟：全屏启动 / autoLaunch dev 跳过 / 日志落盘（scope=hospital） |
| 2. 业务页面 ✅（演示级） | 首页入口 / 门诊挂号（科室选择→取号→打印凭条）/ 报告打印（读卡或扫码→列表→打印）/ 导诊指引；mock 数据已标注真实接口替换位 | 页面流程走通（HIS 对接时替换 mock） |
| 3. 扫码枪 ✅ | use-scanner composable：HID 键盘流监听（间隔 <50ms + Enter 收尾 + 最短码长过滤人工敲键） | 扫码进入报告列表（键盘模拟验证） |
| 4. 打印机 ✅（mock） | core 导出 handle 原语（比 registerAppIpc 更轻，契约不变）；printer 通道 mock 延迟模拟出纸 | 契约/注册/调用链路全通；真实 SDK 联调待硬件选型 |
| 5. 读卡器 ✅（mock） | idcard 通道 mock 返回模拟卡数据 | 契约链路全通；真实 SDK 联调待硬件选型 |
| 6. 部署配套 ✅ | userData/config.json 浅覆盖默认值（machineId / department / serverUrl），解析失败不阻塞启动用默认值 | 同一构建包配置出多台差异化机器 |
| 7. 集中监控（暂停） | 依赖监控服务端协议，未定对接方案前不做臆造接口 | 有服务端协议时补 |

## 六、风险与注意点

- **Windows 触屏**：全屏下无系统软键盘——密码/文字输入需业务页自带数字键盘（自助机惯例，本来就要做）
- **厂商 SDK 兼容**：读卡器/打印机 SDK 多为 32 位 DLL，main 进程是 64 位 Node——优先选带 64 位支持或独立进程（child_process）方案的厂商型号，选型前验证
- **专网环境**：医院内网/政务专网部署时，asar 热更的 feed 服务器需部署在院内；`updates.url` 走配置文件（阶段 6）而非环境变量
- **医保对接**：属业务层（HIS/医保平台接口），与平台框架无关，不占框架工作量
- **断网韧性**：crashReload 只管进程崩溃，业务页需自带网络重连与「服务不可用」兜底态
