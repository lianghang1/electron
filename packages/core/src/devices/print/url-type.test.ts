import { describe, expect, it } from 'vitest'
import { imageExt, typeFromContentType, typeFromUrlPath } from './url-type'

describe('typeFromContentType', () => {
  it('application/pdf → pdf（带参数同样识别）', () => {
    expect(typeFromContentType('application/pdf')).toBe('pdf')
    expect(typeFromContentType('application/pdf; charset=binary')).toBe('pdf')
  })

  it('图片 MIME 白名单内的类型 → image', () => {
    expect(typeFromContentType('image/png')).toBe('image')
    expect(typeFromContentType('image/jpeg')).toBe('image')
  })

  it('未认可的类型 / 缺省 → null', () => {
    expect(typeFromContentType('text/html')).toBeNull()
    expect(typeFromContentType('image/svg+xml')).toBeNull()
    expect(typeFromContentType(null)).toBeNull()
    expect(typeFromContentType(undefined)).toBeNull()
  })
})

describe('typeFromUrlPath', () => {
  it('扩展名识别 pdf 与图片（大小写不敏感，query 不干扰）', () => {
    expect(typeFromUrlPath('https://a.com/r/report.pdf')).toBe('pdf')
    expect(typeFromUrlPath('https://a.com/shot.PNG?token=x')).toBe('image')
    expect(typeFromUrlPath('https://a.com/shot.jpg')).toBe('image')
  })

  it('无扩展名 / 非法 URL → null', () => {
    expect(typeFromUrlPath('https://a.com/report/resource/preview/xyz')).toBeNull()
    expect(typeFromUrlPath('https://a.com/preview/xyz?file=report.pdf')).toBeNull()
    expect(typeFromUrlPath('::::not-a-url')).toBeNull()
  })
})

describe('imageExt', () => {
  it('优先按 Content-Type 映射扩展名', () => {
    expect(imageExt('image/jpeg', 'https://a.com/x')).toBe('.jpg')
    expect(imageExt('image/png; charset=binary', 'https://a.com/x')).toBe('.png')
  })

  it('无 Content-Type 时回落 URL 扩展名', () => {
    expect(imageExt(null, 'https://a.com/x/webp/photo.webp')).toBe('.webp')
  })

  it('均无法确定 → null', () => {
    expect(imageExt('image/svg+xml', 'https://a.com/logo.svg')).toBeNull()
    expect(imageExt(null, 'https://a.com/logo.svg')).toBeNull()
  })
})
