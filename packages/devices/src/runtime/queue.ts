/**
 * 有界并发任务队列：把「内容准备」与「设备动作」分成两条独立管线，
 * 各自限流互不阻塞；任务异常原样抛给调用方，不影响后续排队任务继续推进。
 */
export interface TaskQueue {
  readonly concurrency: number
  /** 正在执行的任务数 */
  readonly active: number
  /** 等待调度的任务数 */
  readonly pending: number
  enqueue: <T>(task: () => Promise<T>) => Promise<T>
}

export function createTaskQueue(concurrency = 1): TaskQueue {
  const limit = Math.max(1, Math.floor(concurrency))
  let active = 0
  const waiting: Array<() => void> = []

  const release = (): void => {
    active--
    next()
  }

  function next(): void {
    while (active < limit && waiting.length > 0) {
      const start = waiting.shift()!
      active++
      start()
    }
  }

  return {
    concurrency: limit,
    get active() { return active },
    get pending() { return waiting.length },
    enqueue<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        waiting.push(() => {
          Promise.resolve()
            .then(task)
            .then(resolve, reject)
            .finally(release)
        })
        next()
      })
    },
  }
}
