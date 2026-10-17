# 拍摄弹层优化 + 拍摄/扫码配置弹窗

## Context

用户要求：1) 优化 packages/ui 的拍摄弹层；2) 新增拍摄（capture）与扫码（scanner）的配置弹窗。

现状：
- 拍摄弹层已落地（packages/ui/src/capture/：CaptureDialog.vue 567 行、use-capture-session.ts 427 行、CaptureStage.vue），但存在交互粗糙点：设备枚举失败静默置空、无加载态、切换设备不恢复预览、无键盘快捷键、缩略图不可放大查看。
- 配置数据链路已备好：scanner:getConfig/setConfig（ipc 层有 sanitizeConfigPatch 白名单）、capture:getConfig/setConfig（服务端校验 id/transport，多设备列表 upsert）。但**没有任何配置 UI 入口**（Shell 无设备管理界面），且 capture 缺删除通道（仅 upsert 单个配置，无法移除）。
- preload 桥按 platformDomains 契约自动生成，新增通道零 preload 改动。

## 关键决策：配置弹窗承载方式 = Shell 内嵌模态

配置弹窗从 Shell 管理界面发起，是纯表单管理 UI，无高帧率数据闭环需求（拍摄/签名弹层走浮层窗是因为预览帧/笔迹点高帧率必须浮层内闭环）。方案：

- **采用**：组件放 packages/ui（符合「UI 配置弹层在 packages/ui 组件化」约定），Shell 直接 import 渲染全屏模态（Shell 是第一方 Vue 应用，AppCenter 已有 in-DOM 模态先例）；数据直调现有 scanner/capture 配置通道；仅新增 `capture:removeConfig` 一条 IPC。
- **不采用**：原生浮层窗承载——需扩 OverlayWindowService 数据源 + OverlayApp 视图 + 打开通道 + 会话管理，改动面大且无收益。

## 任务 1：拍摄弹层优化（packages/ui/src/capture/）

1. **use-capture-session.ts**
   - 新增 `loadingDevices: Ref<boolean>`：refreshDevices 期间置位（设备下拉/预览区显示加载态）
   - 设备枚举失败由静默置空改为 `showError` 留痕（保留置空回落）
   - `changeDevice`：切换前若预览开启，切换后自动重开预览（省一次点击）
   - 新增 `switching: Ref<boolean>`：ws 分辨率切换重启预览 / uvc applyConstraints 期间置位
2. **CaptureDialog.vue**
   - 空格拍照快捷键（keydown Space、非按钮/输入聚焦时 → shoot）
   - 无设备空态：预览区引导文案「未检测到采集设备，请检查连接或在设备管理中添加」
   - 缩略图点击放大：点击后在预览区查看该张（再点击恢复实时预览）
   - 分辨率切换中反馈（switching 状态）
   - **规模控制**：缩略条（含放大查看逻辑与样式）拆出 `CaptureThumbStrip.vue` 子组件，主文件不再扩张
3. **CaptureStage.vue**：空态支持外部传入文案 prop

## 任务 2：扫码枪配置弹窗（packages/ui/src/scanner/）

- `ScannerConfigDialog.vue`：自绘表单（与拍摄弹层同风格）：
  - enabled 开关、timeout（ms 数字）、minLength（数字）、endKey（文本）、requirePrefix 开关
  - prefixes 标签式编辑（输入回车添加、× 删除）
  - 保存：`scanner.setConfig(patch)`（走 ipc sanitizeConfigPatch）；成功「已保存」反馈；所有异步 try/catch 显错
- `use-scanner-config.ts`：getConfig 载入 → 本地可编辑副本 → 保存提取 patch

## 任务 3：拍摄设备配置弹窗 + removeConfig 通道

**IPC 扩展（唯一 core 改动）**：
- `packages/shared/src/types/ipc/devices/capture.ts`：加 `removeConfig: invoke<(id: string) => Promise<boolean>>()`（返回是否发生删除）
- `packages/core/src/devices/capture/service.ts` + `index.ts`：`removeConfig(id)` 列表过滤 → 无此 id 返回 false → persist → buildAdapters
- `packages/core/src/ipc/capture.ts`：`handle('capture:removeConfig', ...)`，id 非字符串抛 `IPC_ERROR`

**packages/ui/src/capture/CaptureConfigDialog.vue**（左列表 + 右表单，表单拆 `CaptureDeviceForm.vue`）：
- 左列表：displayName + transport 标签 + 在线状态点（对照 `capture.listDevices()` 的 id）+「新增设备」；选中编辑、支持删除（删除走新 removeConfig 通道）
- 右表单：displayName、brand、transport 下拉（ws 高拍仪 / dll SDK 直连 / service 服务接入 / wia 扫描仪；uvc/stub 不进配置）；按 transport 切换字段组：
  - ws：url、protocol（dianyipai/camsdk）、camId、width、height
  - dll：file、functions 键值对编辑
  - service：baseUrl、capturePath、listPath、method、imageField、extraHeaders 键值对
  - wia：无附加字段
- id 新增时自动生成（`custom-<随机段>`）不可编辑
- 保存：`capture.setConfig(config)`（服务端 upsert + 热重建适配器）
- `use-capture-config.ts`：getConfigs + listDevices 载入 → 编辑态 → 保存/删除

## 任务 4：Shell 入口与挂载

- `apps/desktop/src/components/TopBar.vue`：应用中心按钮旁加「设备」按钮（套壳模式随之隐藏），emit `toggleDevices`
- `apps/desktop/src/App.vue`：设备弹窗挂载层（fixed 全屏遮罩 + 居中卡片，状态 `deviceDialog: 'none' | 'scanner' | 'capture'`），引用 ui 包两个配置弹窗组件

## 验证

- `pnpm typecheck` / `pnpm lint` / `pnpm test`
- 手动验证（dev 起应用）：
  - TopBar「设备」→ 扫码枪配置：改参数保存 → 重开弹窗确认持久化（userData/device-scanner.json）
  - 拍摄设备配置：新增 ws 配置保存 / 编辑 / 删除；删除后设备列表与拍摄弹层下拉同步消失
  - 拍摄弹层：无设备空态、枚举失败提示、切换设备自动恢复预览、空格拍照、缩略图放大、分辨率切换反馈
