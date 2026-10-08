import { describe, expect, it } from 'vitest'
import { planArchiveCleanup } from './archive-cleanup'

const DAY = 86400000

describe('planArchiveCleanup —— 归档孤儿清扫', () => {
  const now = DAY * 100

  it('超过保留期且无引用 → 删除', () => {
    const files = [{ name: 'old.pdf', mtimeMs: now - 40 * DAY }]
    expect(planArchiveCleanup(files, new Set(), 30, now)).toEqual(['old.pdf'])
  })

  it('保留期内 → 保留', () => {
    const files = [{ name: 'new.pdf', mtimeMs: now - 5 * DAY }]
    expect(planArchiveCleanup(files, new Set(), 30, now)).toEqual([])
  })

  it('在册任务引用的文件 → 豁免（保证近期任务可重打）', () => {
    const files = [{ name: 'old.pdf', mtimeMs: now - 90 * DAY }]
    expect(planArchiveCleanup(files, new Set(['old.pdf']), 30, now)).toEqual([])
  })

  it('retentionDays=0 → 关闭清扫', () => {
    const files = [{ name: 'ancient.pdf', mtimeMs: 0 }]
    expect(planArchiveCleanup(files, new Set(), 0, now)).toEqual([])
  })

  it('文件名按 basename 比对（引用集合以文件名登记）', () => {
    const files = [
      { name: 'a.pdf', mtimeMs: now - 100 * DAY },
      { name: 'b.pdf', mtimeMs: now - 100 * DAY },
    ]
    expect(planArchiveCleanup(files, new Set(['b.pdf']), 30, now)).toEqual(['a.pdf'])
  })
})
