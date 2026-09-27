import type { DesktopAppManifest } from '@desktop/shared'
import { describe, expect, it } from 'vitest'
import { AppRegistry } from '../src/app/app-registry'

function manifest(id: string): DesktopAppManifest {
  return {
    id,
    name: id.toUpperCase(),
    version: '1.0.0',
    type: 'internal',
    entry: { type: 'web', url: `https://example.com/${id}` },
    permissions: [],
  }
}

describe('appRegistry', () => {
  it('注册后可查询，get 返回 manifest，has/list 同步', () => {
    const registry = new AppRegistry()
    registry.register(manifest('crm'))
    expect(registry.has('crm')).toBe(true)
    expect(registry.get('crm')?.name).toBe('CRM')
    expect(registry.list()).toHaveLength(1)
    expect(registry.list()[0].source).toBe('code')
  })

  it('重复注册同一 id 抛错（冲突以先注册方为准）', () => {
    const registry = new AppRegistry()
    registry.register(manifest('crm'))
    expect(() => registry.register(manifest('crm'))).toThrowError(/already registered/)
  })

  it('unregister 后失效', () => {
    const registry = new AppRegistry()
    registry.register(manifest('crm'))
    registry.unregister('crm')
    expect(registry.has('crm')).toBe(false)
    expect(registry.get('crm')).toBeUndefined()
  })
})
