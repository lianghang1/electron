/**
 * 设备串行锁容器（跨域共享基座）：同一硬件资源同一时刻只执行一个任务。
 * 锁 key 由调用方按设备语义决定（设备 ID，或驱动使用进程级全局资源时声明的 lockGroup），
 * 容器只保证同 key 串行。链上任务异常不阻塞后续任务。
 */
export class SerialLocks {
  private locks = new Map<string, Promise<unknown>>()

  /** 同锁 key 串行化执行（存入链的 promise 已吞异常，永不 reject） */
  run<R>(lockKey: string, task: () => Promise<R> | R): Promise<R> {
    const prev = this.locks.get(lockKey) ?? Promise.resolve()
    const pending = prev.then(() => task())
    this.locks.set(lockKey, pending.catch(() => undefined))
    return pending
  }
}

/**
 * 设备锁 key：驱动使用进程级全局资源（如 chdir 切 cwd）时在设备 meta 声明 lockGroup
 * 跨设备互斥，其余按设备 ID 串行。listReaders 枚举时由驱动声明透传进 meta。
 */
export function deviceLockKey(device: { id: string, meta: Record<string, unknown> }): string {
  return (device.meta as { lockGroup?: string } | undefined)?.lockGroup ?? device.id
}
