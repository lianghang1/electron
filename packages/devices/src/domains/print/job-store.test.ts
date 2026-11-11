import type { PrintRequest, PrintResult } from '@shell/shared'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { JobStore } from './job-store'

const dir = mkdtempSync(join(tmpdir(), 'print-jobs-'))
let seq = 0
const store = (): JobStore => new JobStore(join(dir, `jobs-${++seq}.json`))

const request: PrintRequest = {
  payload: { kind: 'html', html: '<p>x</p>' },
  options: { paper: 'A4' },
}
const result = (jobId: string): PrintResult => ({ jobId, channel: 'system', printerId: 'p1' })

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('任务簿状态与卡住检测', () => {
  it('新建任务为 accepted，完成后带 elapsedMs', () => {
    vi.useFakeTimers()
    const jobs = store()
    jobs.create(request, 'j1', 'task-1')
    expect(jobs.status('j1')?.state).toBe('accepted')
    jobs.markPrinting('j1')
    jobs.finish('j1', result('j1'))
    const status = jobs.status('j1')
    expect(status?.state).toBe('done')
    expect(status?.result?.jobId).toBe('j1')
    expect(typeof status?.elapsedMs).toBe('number')
    vi.runAllTimers()
    vi.useRealTimers()
  })

  it('printing 超过阈值被检出并标记 stuck，state 保持不变', () => {
    vi.useFakeTimers()
    const jobs = store()
    jobs.create(request, 'j2', 'task-2')
    jobs.markPrinting('j2')
    expect(jobs.detectStuck(1000, Date.now() + 999)).toEqual([])
    expect(jobs.detectStuck(1000, Date.now() + 1000)).toEqual(['j2'])
    const status = jobs.status('j2')
    expect(status?.stuck).toBe(true)
    expect(status?.state).toBe('printing')
    vi.runAllTimers()
    vi.useRealTimers()
  })

  it('已完成或失败任务不会被判为卡住', () => {
    vi.useFakeTimers()
    const jobs = store()
    jobs.create(request, 'j3', 'task-3')
    jobs.markPrinting('j3')
    jobs.finish('j3', result('j3'))
    jobs.create(request, 'j4', 'task-4')
    jobs.markPrinting('j4')
    jobs.fail('j4', { code: 'JOB_FAILED', message: 'x' })
    expect(jobs.detectStuck(1, Date.now() + 10000)).toEqual([])
    vi.runAllTimers()
    vi.useRealTimers()
  })

  it('通道回读状态写入 status', () => {
    vi.useFakeTimers()
    const jobs = store()
    jobs.create(request, 'j5', 'task-5')
    jobs.markRemoteState('j5', 'printing')
    expect(jobs.status('j5')?.remoteState).toBe('printing')
    vi.runAllTimers()
    vi.useRealTimers()
  })

  it('任务列表按创建时间倒序，可查引用归档', () => {
    vi.useFakeTimers()
    const jobs = store()
    jobs.create(request, 'a', 'a')
    jobs.create(request, 'b', 'b')
    jobs.finish('a', { jobId: 'a', channel: 'system', printerId: 'p1', archivedPdfPath: '/tmp/a.pdf' })
    expect(jobs.list().map(s => s.jobId)).toEqual(['b', 'a'])
    expect([...jobs.referencedArchiveFiles()]).toEqual(['a.pdf'])
    vi.runAllTimers()
    vi.useRealTimers()
  })
})
