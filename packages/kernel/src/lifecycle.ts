/**
 * 生命周期契约：kernel 内所有系统实现此接口。
 * 启动按依赖序，关闭逆序——顺序由组合根保证。
 */
export interface Startable {
  /** 名称用于启动日志与错误定位 */
  readonly name: string
  start: () => Promise<void>
  stop: () => Promise<void>
}

/** 可释放资源（窗口、进程句柄等） */
export interface Disposable {
  dispose: () => void
}

/** 启动阶段打点（launch marks）：T0=进程启动 → T4=首帧渲染 */
export interface LaunchMarks {
  t0ProcessStart: number
  t1KernelReady?: number
  t2DeviceHostReady?: number
  t3WindowShown?: number
  t4FirstPaint?: number
}

export function createLaunchMarks(): LaunchMarks {
  return { t0ProcessStart: Date.now() }
}
