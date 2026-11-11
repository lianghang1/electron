/**
 * 统一操作超时：六域与调用管线共用唯一一份实现。
 * 超时错误由调用方提供（域错误码属于对外契约，runtime 不感知具体域）。
 */
export function withDeadline<T>(
  task: Promise<T>,
  timeoutMs: number,
  onTimeout: (timeoutMs: number) => unknown,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout(timeoutMs)), timeoutMs)
    task.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}
