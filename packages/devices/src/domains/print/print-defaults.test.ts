import type { PrintRequest } from '@shell/shared'
import { describe, expect, it } from 'vitest'
import { mergePrintDefaults } from './print-defaults'

function request(options: Record<string, unknown> = {}): PrintRequest {
  return {
    payload: { kind: 'html', html: '<p>a</p>' },
    options: { paper: 'A4', ...options } as PrintRequest['options'],
  }
}

describe('打印现场缺省参数', () => {
  it('无缺省时原样返回请求对象', () => {
    const req = request()
    expect(mergePrintDefaults(req)).toBe(req)
    expect(mergePrintDefaults(req, {})).toBe(req)
  })

  it('缺省字段补齐，请求显式字段优先', () => {
    const merged = mergePrintDefaults(request({ paper: '80x60' }), { paper: 'A4', channel: 'dry-run', copies: 2 })
    expect(merged.options).toMatchObject({ paper: '80x60', channel: 'dry-run', copies: 2 })
  })

  it('缺省参数变化在下一次提交生效', () => {
    const defaults: Record<string, unknown> = { channel: 'preview' }
    expect(mergePrintDefaults(request(), defaults).options.channel).toBe('preview')
    defaults.channel = 'dry-run'
    expect(mergePrintDefaults(request(), defaults).options.channel).toBe('dry-run')
  })
})
