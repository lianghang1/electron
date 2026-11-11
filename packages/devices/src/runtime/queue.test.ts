import { describe, expect, it } from 'vitest'
import { createTaskQueue } from './queue'

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

describe('有界并发任务队列', () => {
  it('并发上限生效，active/pending 计数准确', async () => {
    const queue = createTaskQueue(2)
    expect(queue.concurrency).toBe(2)
    let running = 0
    let peak = 0
    const task = async (): Promise<number> => {
      running++
      peak = Math.max(peak, running)
      await tick()
      running--
      return 1
    }
    const results = await Promise.all(Array.from({ length: 6 }, () => queue.enqueue(task)))
    expect(results).toHaveLength(6)
    expect(peak).toBe(2)
    expect(queue.active).toBe(0)
    expect(queue.pending).toBe(0)
  })

  it('单并发严格串行', async () => {
    const queue = createTaskQueue(1)
    const order: string[] = []
    const make = (name: string) => async (): Promise<void> => {
      order.push(`start:${name}`)
      await tick()
      order.push(`end:${name}`)
    }
    await Promise.all([
      queue.enqueue(make('a')),
      queue.enqueue(make('b')),
      queue.enqueue(make('c')),
    ])
    expect(order).toEqual(['start:a', 'end:a', 'start:b', 'end:b', 'start:c', 'end:c'])
  })

  it('任务异常原样抛出，且不阻塞后续任务', async () => {
    const queue = createTaskQueue(1)
    await expect(queue.enqueue(async () => { throw new Error('boom') })).rejects.toThrow('boom')
    await expect(queue.enqueue(async () => 42)).resolves.toBe(42)
    expect(queue.active).toBe(0)
  })

  it('并发数归一：0 与负数都按 1 处理', () => {
    expect(createTaskQueue(0).concurrency).toBe(1)
    expect(createTaskQueue(-3).concurrency).toBe(1)
  })
})
