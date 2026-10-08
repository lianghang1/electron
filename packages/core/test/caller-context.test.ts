import type { WebContents } from 'electron'
import { DesktopError } from '@desktop/shared'
import { describe, expect, it } from 'vitest'
import { SHELL_APP_ID } from '../src/constants'
import { assertShell, CallerResolver } from '../src/ipc/caller-context'

/** CallerResolver 只消费 webContents.id，测试用最小桩替代真实 WebContents */
function fakeWebContents(id: number): WebContents {
  return { id } as WebContents
}

const shellContext = { appId: SHELL_APP_ID, instanceId: 'shell' }
const appContext = { appId: 'crm', instanceId: 'crm-1' }

describe('callerResolver', () => {
  it('登记后按 webContents.id 反查身份', () => {
    const resolver = new CallerResolver()
    const wc = fakeWebContents(1)
    resolver.register(wc, appContext)
    expect(resolver.resolve(wc)).toEqual(appContext)
  })

  it('未登记的调用者 resolve 抛错（Renderer 无法伪造身份）', () => {
    const resolver = new CallerResolver()
    expect(() => resolver.resolve(fakeWebContents(99)))
      .toThrowError(DesktopError)
  })

  it('tryResolve 不抛错：未登记返回 undefined（DevTools 等系统级 webContents）', () => {
    const resolver = new CallerResolver()
    expect(resolver.tryResolve(fakeWebContents(99))).toBeUndefined()
    resolver.register(fakeWebContents(1), shellContext)
    expect(resolver.tryResolve(fakeWebContents(1))).toEqual(shellContext)
  })

  it('注销后身份失效', () => {
    const resolver = new CallerResolver()
    const wc = fakeWebContents(1)
    resolver.register(wc, appContext)
    resolver.unregister(wc.id)
    expect(() => resolver.resolve(wc)).toThrowError(DesktopError)
  })
})

describe('assertShell', () => {
  it('shell 身份放行', () => {
    expect(() => assertShell(shellContext)).not.toThrow()
  })

  it('普通 App 被拒绝并携带 appId 详情', () => {
    expect(() => assertShell(appContext)).toThrowError(DesktopError)
  })
})
