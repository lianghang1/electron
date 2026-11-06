import type { CaptureDialogSession } from '@shell/shared'
import type { WebContents } from 'electron'

/**
 * 拍摄浮层宿主 SPI（依赖倒置，铁律三）：
 * capture 域声明它需要窗口系统提供的能力，不 import WindowSystem——
 * 具体实现由组合根注入（WindowSystem 实现，M2 接 AppRuntime 时落地）。
 */
export interface CaptureOverlayHost {
  /** 浮层确认/取消后经此回传会话结果 */
  pushCaptureSession(session: CaptureDialogSession): void
  /** 浮层窗句柄（预览帧与结果回传的 sender 身份校验用） */
  getCaptureWindow(): { webContents: WebContents } | null
  /** 结束当前拍摄会话并关闭浮层 */
  dismissCaptureSession(): void
}
