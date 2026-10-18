import { buildOverlayHash, parseOverlayHash } from '@desktop/shared'
import { describe, expect, it } from 'vitest'

describe('parseOverlayHash', () => {
  it('带 kind 的 hash 按用途解析', () => {
    expect(parseOverlayHash('#/overlay?kind=panel')).toBe('panel')
    expect(parseOverlayHash('#/overlay?kind=dialog')).toBe('dialog')
    expect(parseOverlayHash('#/overlay?kind=menu')).toBe('menu')
    expect(parseOverlayHash('#/overlay?kind=capture')).toBe('capture')
    expect(parseOverlayHash('#/overlay?kind=config')).toBe('config')
  })

  it('裸浮层 hash 与缺省/非法 kind 归一为 panel', () => {
    expect(parseOverlayHash('#/overlay')).toBe('panel')
    expect(parseOverlayHash('#/overlay?')).toBe('panel')
    expect(parseOverlayHash('#/overlay?kind=unknown')).toBe('panel')
  })

  it('非浮层页 hash 返回 null（入口据此挂载 Shell 框架）', () => {
    expect(parseOverlayHash('')).toBeNull()
    expect(parseOverlayHash('#/')).toBeNull()
    expect(parseOverlayHash('#/app/devices')).toBeNull()
    expect(parseOverlayHash('#/overlayx?kind=menu')).toBeNull()
  })
})

describe('buildOverlayHash', () => {
  it('各 kind 编码为带 query 的浮层 hash', () => {
    expect(buildOverlayHash('panel')).toBe('#/overlay?kind=panel')
    expect(buildOverlayHash('config')).toBe('#/overlay?kind=config')
  })

  it('编码结果可被 parseOverlayHash 还原', () => {
    for (const kind of ['panel', 'dialog', 'menu', 'capture', 'config'] as const) {
      expect(parseOverlayHash(buildOverlayHash(kind))).toBe(kind)
    }
  })
})
