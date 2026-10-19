import type { AsarUpdateState } from '@desktop/shared'
import type { Logger } from '../src/logger/logger'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import AdmZip from 'adm-zip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '../src/event/event-bus'
import { AsarUpdateService } from '../src/updater/asar-update-service'

// AsarUpdateService 依赖 electron（app/net）与 original-fs：测试期 mock，
// original-fs 桥接为真实 fs（node 环境无 asar 补丁，行为一致）
const paths = vi.hoisted(() => ({ userData: '' }))
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => paths.userData,
    getVersion: () => '1.0.0',
  },
  net: { fetch: fetchMock },
}))

vi.mock('original-fs', async () => {
  const nodeFs = await import('node:fs')
  return {
    default: {
      createWriteStream: nodeFs.createWriteStream,
      readFileSync: nodeFs.readFileSync.bind(nodeFs),
      writeFileSync: nodeFs.writeFileSync.bind(nodeFs),
      rm: nodeFs.rm.bind(nodeFs),
      rmSync: nodeFs.rmSync.bind(nodeFs),
    },
  }
})

vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))

const FEED_URL = 'https://feed.example.com/desktop'
const MANIFEST_URL = `${FEED_URL}/asar-manifest.json`
const BUILTIN_VERSION = '1.0.0'

const updaterDir = () => path.join(paths.userData, 'desktop-updater')
const proc = process as unknown as { resourcesPath?: string }

let events: EventBus
let states: AsarUpdateState[]

beforeEach(() => {
  paths.userData = mkdtempSync(path.join(tmpdir(), 'asar-update-test-'))
  delete proc.resourcesPath
  fetchMock.mockReset()
  events = new EventBus()
  states = []
  events.on('update:asarState', (state) => { states.push(state) })
})

afterEach(() => {
  rmSync(paths.userData, { recursive: true, force: true })
})

function createService(source: string | ConstructorParameters<typeof AsarUpdateService>[0]): AsarUpdateService {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger
  return new AsarUpdateService(source, FEED_URL, events, logger)
}

/** 构造自描述 zip（update.json + asar 条目）与对应清单 */
function buildBundle(options: { version: string, minResourcesVersion?: string }): { manifestUrl: string, zipBytes: Buffer } {
  const asarBytes = Buffer.from(`fake-asar-${options.version}`)
  const bundle = {
    version: options.version,
    file: `core-${options.version}.asar`,
    sha256: createHash('sha256').update(asarBytes).digest('hex'),
    ...(options.minResourcesVersion ? { minResourcesVersion: options.minResourcesVersion } : {}),
  }
  const zip = new AdmZip()
  zip.addFile('update.json', Buffer.from(JSON.stringify(bundle)))
  zip.addFile(bundle.file, asarBytes)
  return { manifestUrl: `${FEED_URL}/core-${options.version}.zip`, zipBytes: zip.toBuffer() }
}

describe('清单请求定制（T5）', () => {
  it('适配器源透传 method / headers / body（鉴权头场景）', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ version: '0.0.1', url: `${FEED_URL}/core-0.0.1.zip` }), { status: 200 }))
    const service = createService({
      endpoint: 'https://api.example.com/update/check',
      method: 'POST',
      headers: { 'X-Api-Key': 'secret-key' },
      body: JSON.stringify({ appId: 'demo' }),
    })

    await service.check()

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.com/update/check')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ 'X-Api-Key': 'secret-key' })
    expect(init.body).toBe(JSON.stringify({ appId: 'demo' }))
    // 旧版本清单：状态归位 idle，不触发下载
    expect(service.getState().status).toBe('idle')
  })

  it('字符串清单源保持 GET 且不带定制请求', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ version: BUILTIN_VERSION, url: `${FEED_URL}/core-1.0.0.zip` }), { status: 200 }))
    const service = createService('asar-manifest.json')

    await service.check()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(MANIFEST_URL)
    expect(init.method).toBe('GET')
    expect(init.headers).toBeUndefined()
    expect(init.body).toBeUndefined()
  })
})

describe('资源门槛 blocked 状态（T2）', () => {
  it('minResourcesVersion 高于本机 resources：推 blocked 且不写 pending', async () => {
    const { manifestUrl, zipBytes } = buildBundle({ version: '1.1.0', minResourcesVersion: '2.0.0' })
    // 本机 resources 版本标记（afterPack 写入位置）
    const resourcesRoot = path.join(paths.userData, 'resources-mock')
    mkdirSync(path.join(resourcesRoot, 'resources'), { recursive: true })
    writeFileSync(path.join(resourcesRoot, 'resources', '.resources-version'), BUILTIN_VERSION)
    proc.resourcesPath = resourcesRoot
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: '1.1.0', url: manifestUrl }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array(zipBytes), { status: 200, headers: { 'content-length': String(zipBytes.length) } }))

    const service = createService('asar-manifest.json')
    await service.check()

    const last = service.getState()
    expect(last.status).toBe('blocked')
    expect(last.version).toBe('1.1.0')
    expect(last.minResourcesVersion).toBe('2.0.0')
    // 校验不过不落 pending，zip 容器已清理
    expect(existsSync(path.join(updaterDir(), 'pending.json'))).toBe(false)
    expect(existsSync(path.join(updaterDir(), `core-1.1.0.zip`))).toBe(false)
  })

  it('minResourcesVersion 缺省（旧包兼容）：正常落 pending', async () => {
    const { manifestUrl, zipBytes } = buildBundle({ version: '1.1.0' })
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: '1.1.0', url: manifestUrl }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array(zipBytes), { status: 200, headers: { 'content-length': String(zipBytes.length) } }))

    const service = createService('asar-manifest.json')
    await service.check()

    expect(service.getState().status).toBe('pending')
    expect(existsSync(path.join(updaterDir(), 'pending.json'))).toBe(true)
    expect(existsSync(path.join(updaterDir(), 'core-1.1.0.asar'))).toBe(true)
  })
})

describe('下载即清孤儿（T9）', () => {
  it('写 pending 时删除非生效、非本次下载的 core-*.asar', async () => {
    const { manifestUrl, zipBytes } = buildBundle({ version: '1.1.0' })
    // 预置生效热更 1.0.5 与孤儿 0.9.0
    mkdirSync(updaterDir(), { recursive: true })
    writeFileSync(path.join(updaterDir(), 'core-1.0.5.asar'), 'current')
    writeFileSync(path.join(updaterDir(), 'core-0.9.0.asar'), 'orphan')
    writeFileSync(path.join(updaterDir(), 'current.json'), JSON.stringify({ version: '1.0.5', file: 'core-1.0.5.asar', appliedAt: 1 }))
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: '1.1.0', url: manifestUrl }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array(zipBytes), { status: 200, headers: { 'content-length': String(zipBytes.length) } }))

    const service = createService('asar-manifest.json')
    await service.check()

    expect(service.getState().status).toBe('pending')
    expect(existsSync(path.join(updaterDir(), 'core-1.1.0.asar'))).toBe(true)
    expect(existsSync(path.join(updaterDir(), 'core-1.0.5.asar'))).toBe(true)
    expect(existsSync(path.join(updaterDir(), 'core-0.9.0.asar'))).toBe(false)
  })
})

describe('下载可取消（T4）', () => {
  it('下载中途 cancel：状态归位 idle 且无 zip 残留', async () => {
    const manifest = { version: '1.1.0', url: `${FEED_URL}/core-1.1.0.zip` }
    // zip 返回慢流：enqueue 一块后挂住（abort 时 close，让 pipeline 抛 AbortError）
    fetchMock.mockImplementation(async (url: string, init?: { signal?: AbortSignal }) => {
      if (url === MANIFEST_URL) {
        return new Response(JSON.stringify(manifest), { status: 200 })
      }
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(1024))
          init?.signal?.addEventListener('abort', () => {
            try { controller.close() }
            catch {}
          }, { once: true })
        },
      }), { status: 200, headers: { 'content-length': '4096' } })
    })

    const service = createService('asar-manifest.json')
    const checking = service.check()
    await vi.waitFor(() => {
      expect(service.getState().status).toBe('downloading')
    })
    service.cancel()

    await checking
    expect(service.getState().status).toBe('idle')
    expect(existsSync(path.join(updaterDir(), 'core-1.1.0.zip'))).toBe(false)
    // 取消后再次检查正常进入 checking（无卡死）
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ version: '0.0.1', url: `${FEED_URL}/core-0.0.1.zip` }), { status: 200 }))
    await service.check()
    expect(service.getState().status).toBe('idle')
  })
})
