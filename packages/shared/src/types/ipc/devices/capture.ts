import type { CaptureCameraInfo, CaptureDevice, CaptureDeviceConfig, CaptureDeviceOverrides, CaptureDialogRequest, CaptureRequest, CaptureResult } from '../../devices/capture'
import { invoke, push } from '../../../domain'

/**
 * capture 域契约 —— 图像采集（高拍仪/扫描仪/摄像头，多品牌多接入方式）。
 *
 * 按业务流分组，调用方按需取用：
 * ── 设备发现与配置（devices 测试页 / 设备管理 / 未来配置弹层）：listDevices / getConfig / setConfig / listCameras
 * ── 无头直拍（业务页程序化采集，无 UI）：snap / saveDataUrl
 * ── 预览流（发起窗口自绘预览 UI，帧推给调用者自身）：startPreview / stopPreview / frameReceived
 * ── 拍摄浮层（平台提供采集 UI，结果随 Promise 交付）：
 *    · 发起方通道（业务页调用）：openCaptureDialog / closeCaptureDialog
 *    · 浮层窗内会话操作（仅拍摄窗调用，Main 按会话校验身份）：dialog* 前缀
 *
 * 无头直拍（snap）与浮层采集（openCaptureDialog）是两个正交动作，不合并：
 * 前者纯程序化无 UI、恒单张；后者开原生浮层窗、占用全局互斥会话、可多拍/取消（返回数组），
 * 专属参数（format… vs title/maxCount…）与专属错误（DEVICE_BUSY）互斥。
 *
 * 设备配置（CaptureDeviceConfig）清单由代码出厂预设锁死，界面仅提交白名单覆盖
 * （CaptureDeviceOverrides：名称/连接参数），多设备域配置为每设备一份的列表。
 *
 * saveDataUrl 仅为 UVC 路线配套：图片数据在渲染层抽帧（getUserMedia dataURL），
 * 落盘须经 Main 的 fs；ws/SDK 路线 Main 直接收字节自行落盘，不走该通道。
 *
 * 失败统一 reject（IpcRemoteError，code 见 CaptureErrorCode），渲染层 try/catch 按错误码分支。
 * 文件与 core/src/ipc/capture.ts（注册实现）一一对应。
 */
export const captureDomainDefs = {
  // ---- 设备发现与配置 ----
  /** 设备列表：各适配器上报后合并（含连通性探测状态） */
  listDevices: invoke<() => Promise<CaptureDevice[]>>(),
  /** 设备配置列表（出厂预设 + 现场白名单覆盖合并后的全量档案，只读视图） */
  getConfig: invoke<() => Promise<CaptureDeviceConfig[]>>(),
  /** 现场白名单覆盖（按档案 id 提交名称/连接参数；清单与技术字段代码锁死，热重建适配器） */
  setConfig: invoke<(id: string, overrides: CaptureDeviceOverrides) => void>(),
  /** 枚举设备下的摄像头与分辨率（ws/camsdk GetCameraInfo；不占用摄像头） */
  listCameras: invoke<(deviceId: string) => Promise<CaptureCameraInfo[]>>(),
  /** 域默认设备 id（系统设置指定；业务调用 deviceId 缺省时优先使用，就绪才生效） */
  getDefaultDevice: invoke<() => Promise<string | undefined>>(),
  /** 设置域默认设备（undefined = 清除，回落自动定位）；id 需为已注册设备的统一 id */
  setDefaultDevice: invoke<(id: string | undefined) => void>(),

  // ---- 无头直拍（无 UI，程序化采集一张） ----
  /** 采集一张：deviceId 缺省时按默认设备自动定位；同一设备串行化；该设备预览开启时走会话内拍照 */
  snap: invoke<(req: CaptureRequest) => Promise<CaptureResult>>(),
  /** UVC 路线（渲染层 getUserMedia）拍到的 dataURL 落盘为图片文件，返回绝对路径 */
  saveDataUrl: invoke<(input: { dataUrl: string, ext?: 'jpg' | 'png' }) => Promise<string>>(),

  // ---- 预览流（帧推给发起预览的窗口自身，由窗口自绘预览 UI） ----
  /** 开启实时预览（ws/camsdk 高拍仪）：会话保持供 snap 会话内拍照 */
  startPreview: invoke<(input: { deviceId: string, resolutionNum?: number }) => Promise<void>>(),
  /** 关闭实时预览 */
  stopPreview: invoke<(deviceId: string) => Promise<void>>(),
  /** 实时预览帧推送（JPEG base64；仅推给发起预览的窗口） */
  frameReceived: push<[frame: { deviceId: string, base64: string }]>(),

  // ---- 拍摄浮层：发起方通道（业务页调用，结果随 Promise 一一对应，无需事件配对） ----
  /**
   * 发起拍摄浮层：Main 打开第四类原生浮层窗（全局互斥，占用中 reject DEVICE_BUSY）。
   * Promise 在浮层结束时交付：确认回传 resolve 结果数组，用户取消/未拍 resolve 空数组，
   * 会话异常 reject。
   */
  openCaptureDialog: invoke<(req: CaptureDialogRequest) => Promise<CaptureResult[]>>(),
  /** 页面主动取消浮层（仅发起 tab 可调）：Promise 以空结果收尾 */
  closeCaptureDialog: invoke<() => Promise<void>>(),

  // ---- 拍摄浮层：浮层窗内会话操作（仅拍摄窗调用；会话关闭/取消回传见 overlay.dismissCapture） ----
  /** 浮层内开启预览（帧经 frameReceived 推回浮层窗自身） */
  dialogStartPreview: invoke<(input: { deviceId: string, resolutionNum?: number }) => Promise<void>>(),
  /** 浮层内关闭预览 */
  dialogStopPreview: invoke<() => Promise<void>>(),
  /**
   * 浮层内拍一张。UVC 路线传 dataUrl（浮层抽帧，meta 可带成片像素）落盘；
   * ws/SDK 路线不传，由 Main 按会话设备走 capture 会话内拍照。结果由浮层 UI 收集，确认时统一回传。
   */
  dialogCapture: invoke<(opts?: { dataUrl?: string, meta?: Record<string, unknown> }) => Promise<CaptureResult>>(),
  /** 确认回传（非空结果数组，作为 openCaptureDialog 的 resolve 值，Main 随即关闭浮层） */
  dialogConfirm: invoke<(results: CaptureResult[]) => Promise<void>>(),
}
