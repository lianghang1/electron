import type { PlatformKernel } from '@shell/kernel'
import type { Logger } from '@shell/kernel/logger'
import type { WindowSystem } from '@shell/window'
import { registerIpcDomain } from '@shell/bridge/handle'
import { systemDomain } from '@shell/shared/ipc'

export interface SystemIpcDeps {
  kernel: PlatformKernel
  logger: Logger
  windows: WindowSystem
}

/** system 根域注册（send 通道）：内容区矩形上报与启动打点（T4 首帧） */
export function registerSystemIpc(deps: SystemIpcDeps): void {
  registerIpcDomain(systemDomain, {
    reportContentRect: (_e, rect) => deps.windows.setContentRect(rect),
    markFirstPaint: () => {
      deps.kernel.ctx.marks.t4FirstPaint = Date.now()
      const m = deps.kernel.ctx.marks
      // 启动全链路打点汇总（一次启动一行，观测启动回归）
      deps.logger.info('launch marks', {
        t0_process: m.t0ProcessStart,
        t1_kernel: m.t1KernelReady,
        t2_deviceHost: m.t2DeviceHostReady,
        t3_window: m.t3WindowShown,
        t4_firstPaint: m.t4FirstPaint,
      })
    },
  })
}
