import type { Logger } from '../src/logger/logger'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOriginAllowed, loadRemoteAppManifests } from '../src/app/app-source'

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('isOriginAllowed', () => {
  it('白名单为空 = 远程源整体禁用', () => {
    expect(isOriginAllowed('https://apps.company.com/manifest.json', [])).toBe(false)
  })

  it('origin 精确命中（含协议与端口）才放行', () => {
    const origins = ['https://apps.company.com', 'http://127.0.0.1:8765']
    expect(isOriginAllowed('https://apps.company.com/manifest.json', origins)).toBe(true)
    expect(isOriginAllowed('http://127.0.0.1:8765/manifest.json', origins)).toBe(true)
    // 端口 / 协议不同视为不同 origin
    expect(isOriginAllowed('https://apps.company.com:8443/manifest.json', origins)).toBe(false)
    expect(isOriginAllowed('http://apps.company.com/manifest.json', origins)).toBe(false)
    // 子域不在白名单内
    expect(isOriginAllowed('https://evil.apps.company.com/manifest.json', origins)).toBe(false)
  })

  it('非法 URL 一律不允许', () => {
    expect(isOriginAllowed('not-a-url', ['https://apps.company.com'])).toBe(false)
  })
})

describe('loadRemoteAppManifests', () => {
  it('origin 不在白名单：不发请求直接拒绝', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const result = await loadRemoteAppManifests('https://evil.com/apps.json', logger, ['https://apps.company.com'])
    expect(result).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })

  it('命中白名单：拉取并过滤无效 manifest，记录跳过数量', async () => {
    const payload = [
      { id: 'wiki', name: 'Wiki', version: '1.0.0', type: 'internal', entry: { type: 'web', url: 'https://example.com' } },
      { broken: true },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    }))
    const result = await loadRemoteAppManifests('https://apps.company.com/apps.json', logger, ['https://apps.company.com'])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('wiki')
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('invalid manifest'), expect.anything())
  })

  it('响应非数组：告警并返回空', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }))
    const result = await loadRemoteAppManifests('https://apps.company.com/apps.json', logger, ['https://apps.company.com'])
    expect(result).toEqual([])
  })
})
