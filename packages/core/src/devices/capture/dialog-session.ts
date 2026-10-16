import type { CaptureDialogClosedReason, CaptureDialogRequest, CaptureDialogSession, CaptureResult } from '@desktop/shared'
import type { WebContents } from 'electron'
import type { OverlayWindowService } from '../../window/overlay-window'
import type { CaptureSystem } from './index'
import { DesktopError } from '@desktop/shared'
import { captureError } from './errors'

/** 确认回传后的浮层宽限收场时长（ms）：发起页拿到结果并渲染后再关浮层 */
const CONFIRM_SETTLE_MS = 300

/** 拍摄浮层发起方身份（Main 侧从 CallerContext 提取，渲染层无法伪造） */
export interface CaptureDialogOrigin {
  wc: WebContents
  tabId?: string
  appId: string
  appName: string
}

export interface CaptureDialogSessionDeps {
  /** 采集系统（SDK 拍摄走统一采集 API，UVC 抽帧走落盘通道） */
  capture: CaptureSystem
  overlay: OverlayWindowService
}

/** openCaptureDialog 的结果交付句柄：浮层结束时兑现发起页的 invoke Promise */
interface CaptureDialogPending {
  resolve: (results: CaptureResult[]) => void
  reject: (err: Error) => void
}

/**
 * 拍摄浮层会话服务：管理「发起 tab ↔ 拍摄浮层窗」的一次拍摄会话。
 * 全局互斥（同一时刻至多一个浮层，占用中拒绝 DEVICE_BUSY）；预览帧与拍摄数据
 * 在浮层窗内闭环（高帧率数据永不推给业务页面）；确认回传的结果数组即 openCaptureDialog
 * 的 resolve 值（取消=空数组，异常=reject），发起 tab 销毁自动作废，关闭时回收 ws 预览连接。
 */
export class CaptureDialogSessionService {
  private session: CaptureDialogSession | null = null
  private origin: CaptureDialogOrigin | null = null
  private pending: CaptureDialogPending | null = null
  /** 浮层内开启的 ws 预览设备（会话结束统一回收，防连接泄漏） */
  private previewDevice: string | null = null
  private sessionSeq = 0

  constructor(private readonly deps: CaptureDialogSessionDeps) {}

  /** 打开浮层：全局互斥；返回的 Promise 在会话收尾时交付（确认=结果，取消=空数组，其余=reject） */
  open(req: CaptureDialogRequest, origin: CaptureDialogOrigin): Promise<CaptureResult[]> {
    if (this.session) {
      throw captureError('DEVICE_BUSY', '拍摄浮层已打开，请先完成或关闭当前拍摄')
    }
    this.session = {
      sessionId: `capdlg-${++this.sessionSeq}`,
      title: req.title?.trim() || '拍摄',
      appId: origin.appId,
      appName: origin.appName,
      deviceId: req.deviceId || undefined,
      deviceLabel: req.deviceLabel || undefined,
      resolutionNum: req.resolutionNum,
      format: req.format,
      maxCount: normalizeMaxCount(req.maxCount),
    }
    this.origin = origin
    const session = this.session
    return new Promise<CaptureResult[]>((resolve, reject) => {
      this.pending = { resolve, reject }
      // 发起 tab 关闭 → 会话作废（浮层窗随之隐藏）；发起进程已死，交付去向无所谓
      origin.wc.once('destroyed', () => {
        if (this.origin?.wc === origin.wc) {
          this.finish('tabClosed')
        }
      })
      this.deps.overlay.pushCaptureSession(session)
    })
  }

  /** 页面主动取消（仅发起 tab 可调，IPC 层完成身份提取） */
  cancelByCaller(caller: { appId: string, tabId?: string }): void {
    const origin = this.origin
    if (!origin || origin.appId !== caller.appId || origin.tabId !== caller.tabId) {
      return
    }
    this.finish('cancelled')
  }

  /** 浮层页回传取消（× / ESC，IPC 层校验浮层窗身份） */
  cancelByOverlay(): void {
    this.finish('cancelled')
  }

  /** 浮层内开启预览（仅拍摄窗可调）：帧推回浮层窗自身，不经过业务页面 */
  async startPreview(sender: WebContents, deviceId: string, opts?: { resolutionNum?: number }): Promise<void> {
    this.assertCaptureWindow(sender)
    if (!this.session) {
      throw captureError('VALIDATION_FAILED', '拍摄会话未开启')
    }
    await this.deps.capture.startPreview(deviceId, (base64) => {
      const wc = this.deps.overlay.getCaptureWindow()?.webContents
      if (wc && !wc.isDestroyed()) {
        wc.send('capture:onPreviewFrame', { deviceId, base64 })
      }
    }, opts)
    this.previewDevice = deviceId
  }

  async stopPreview(sender: WebContents): Promise<void> {
    this.assertCaptureWindow(sender)
    const deviceId = this.previewDevice
    this.previewDevice = null
    if (deviceId) {
      await this.deps.capture.stopPreview(deviceId)
    }
  }

  /**
   * 浮层内拍摄：UVC 传 dataUrl（浮层抽帧，落平台默认目录，meta 随结果透传——如成片像素）；
   * SDK 路线不传，按会话设备走统一采集（保存目录恒为平台 userData/capture，渲染层不可指定）。
   * 结果由浮层 UI 收集，确认时统一回传。
   */
  async capture(sender: WebContents, opts?: { dataUrl?: string, meta?: Record<string, unknown> }): Promise<CaptureResult> {
    this.assertCaptureWindow(sender)
    const session = this.session
    if (!session) {
      throw captureError('VALIDATION_FAILED', '拍摄会话未开启')
    }
    if (opts?.dataUrl) {
      const imagePath = await this.deps.capture.saveDataUrl(opts.dataUrl, session.format === 'png' ? 'png' : 'jpg')
      return { imagePath, thumbDataUrl: opts.dataUrl, meta: opts.meta }
    }
    if (!session.deviceId) {
      throw captureError('VALIDATION_FAILED', '未选择采集设备')
    }
    return this.deps.capture.capture({
      deviceId: session.deviceId,
      resolutionNum: session.resolutionNum,
      format: session.format,
    })
  }

  /**
   * 浮层内确认回传：校验结果非空后立即兑现 openCaptureDialog 的 Promise（发起页先拿到结果渲染），
   * 浮层「回传中」保持片刻再收场——回传可见、结果先落，避免浮层秒关而结果滞后的割裂感。
   */
  confirm(sender: WebContents, results: CaptureResult[]): void {
    this.assertCaptureWindow(sender)
    if (!this.session) {
      throw captureError('VALIDATION_FAILED', '拍摄会话未开启')
    }
    const valid = (Array.isArray(results) ? results : []).filter(
      r => !!r && typeof r.imagePath === 'string' && r.imagePath.length > 0,
    )
    if (!valid.length) {
      throw captureError('VALIDATION_FAILED', '尚未拍摄任何结果')
    }
    this.recyclePreview()
    this.session = null
    this.origin = null
    const pending = this.pending
    this.pending = null
    pending?.resolve(valid)
    // 交付后的宽限收场：期间若新会话已开（互斥被新请求接管），跳过避免误清新浮层
    setTimeout(() => {
      if (!this.session) {
        this.deps.overlay.dismissCaptureSession()
      }
    }, CONFIRM_SETTLE_MS)
  }

  /**
   * 会话收尾（取消/发起 tab 关闭/异常路径）：回收预览连接、隐藏浮层，兑现 openCaptureDialog
   * 的 Promise——取消=resolve 空数组（正常流程分支，不污染调用方 catch），tabClosed/error=reject。
   * 确认回传不走本方法（见 confirm 的先交付后宽限收场）。pending 缺失（发起进程已死）时交付自然消失。
   */
  private finish(reason: CaptureDialogClosedReason): void {
    if (!this.session) {
      return
    }
    this.recyclePreview()
    this.session = null
    this.origin = null
    this.deps.overlay.dismissCaptureSession()
    const pending = this.pending
    this.pending = null
    if (!pending) {
      return
    }
    if (reason === 'cancelled') {
      pending.resolve([])
      return
    }
    pending.reject(captureError('CAPTURE_FAILED', `拍摄会话异常结束（${reason}）`))
  }

  private recyclePreview(): void {
    const deviceId = this.previewDevice
    this.previewDevice = null
    if (deviceId) {
      // 预览会话可能已被适配器回收（设备掉线等），清理失败不阻断关闭
      void this.deps.capture.stopPreview(deviceId).catch(() => {})
    }
  }

  /** 浮层内操作通道的安全关卡：仅拍摄窗自身可调 */
  private assertCaptureWindow(sender: WebContents): void {
    if (this.deps.overlay.getCaptureWindow()?.webContents !== sender) {
      throw new DesktopError('PERMISSION_DENIED', 'This channel is capture-dialog-only')
    }
  }
}

/** 拍摄张数收敛：非正整数按缺省 1 处理 */
function normalizeMaxCount(value: number | undefined): number {
  return Number.isInteger(value) && value !== undefined && value >= 1 ? value : 1
}
