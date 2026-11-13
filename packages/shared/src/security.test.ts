import { describe, expect, it } from 'vitest'
import {
  assertAllowedUrl,
  assertFetchableUrl,
  assertSafeSegment,
  compareVersions,
  isNewer,
  isPrivateHost,
  isSafeSegment,
  matchesOrigin,
  matchOriginPattern,
} from './security'

describe('compareVersions（语义版本，非字典序）', () => {
  it('0.10.0 大于 0.9.0（字典序会误判为更小）', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1)
    expect(compareVersions('0.9.0', '0.10.0')).toBe(-1)
    expect(isNewer('0.10.0', '0.9.0')).toBe(true)
    expect(isNewer('0.9.0', '0.10.0')).toBe(false)
  })

  it('位数不齐按 0 补齐；正式版大于同数值的预发布版', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('1.2.1', '1.2')).toBe(1)
    expect(compareVersions('2.0.0', '2.0.0-alpha.0')).toBe(1)
    expect(compareVersions('2.0.0-alpha.0', '2.0.0')).toBe(-1)
    expect(compareVersions('2.0.0-alpha.1', '2.0.0-alpha.0')).toBe(1)
  })

  it('真实升级场景：当前 alpha，正式版与补丁版都必须判定为新版本', () => {
    expect(isNewer('2.0.1', '2.0.0-alpha.0')).toBe(true)
    expect(isNewer('2.0.0', '2.0.0-alpha.0')).toBe(true)
    expect(isNewer('2.0.0-alpha.0', '2.0.0-alpha.0')).toBe(false)
  })

  it('v 前缀与相等', () => {
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
  })

  it('恶意/畸形版本不抛异常，退化为 0 段', () => {
    expect(() => compareVersions('', '1.0.0')).not.toThrow()
    expect(compareVersions('not-a-version', '0.0.0')).toBe(0)
  })
})

describe('matchesOrigin（源站边界）', () => {
  const allowed = ['https://a.com']

  it('精确放行，拒绝相似域名与子路径伪造', () => {
    expect(matchesOrigin('https://a.com/path?q=1', allowed)).toBe(true)
    expect(matchesOrigin('https://a.com.evil.com/path', allowed)).toBe(false)
    expect(matchesOrigin('https://evil-a.com/', allowed)).toBe(false)
    expect(matchesOrigin('http://a.com/', allowed)).toBe(false)
  })

  it('端口必须一致', () => {
    expect(matchesOrigin('https://a.com:8443/x', ['https://a.com:8443'])).toBe(true)
    expect(matchesOrigin('https://a.com:9443/x', ['https://a.com:8443'])).toBe(false)
  })

  it('空白名单拒绝一切；* 仅作显式全放行', () => {
    expect(matchesOrigin('https://a.com', [])).toBe(false)
    expect(matchesOrigin('https://anything.example', ['*'])).toBe(true)
  })

  it('子域通配只匹配显式声明的域后缀', () => {
    expect(matchesOrigin('https://sub.a.com/x', ['*.a.com'])).toBe(true)
    expect(matchesOrigin('https://a.com/x', ['*.a.com'])).toBe(true)
    expect(matchesOrigin('https://sub.a.com.evil.com/x', ['*.a.com'])).toBe(false)
  })

  it('非法 URL 与非法模式不抛异常，判定为拒绝', () => {
    expect(matchesOrigin('::::', allowed)).toBe(false)
    expect(matchesOrigin('https://a.com', ['not a url'])).toBe(false)
  })
})

describe('matchOriginPattern（命中模式区分通配与显式条目）', () => {
  it('返回命中的模式本身；无命中返回 undefined', () => {
    expect(matchOriginPattern('https://a.com/x', ['https://a.com'])).toBe('https://a.com')
    expect(matchOriginPattern('https://b.com/x', ['https://a.com'])).toBeUndefined()
    expect(matchOriginPattern('https://b.com/x', ['*'])).toBe('*')
    expect(matchOriginPattern('https://sub.a.com/x', ['*.a.com'])).toBe('*.a.com')
    expect(matchOriginPattern('::::', ['*'])).toBeUndefined()
    expect(matchOriginPattern('https://a.com', [])).toBeUndefined()
  })
})

describe('路径段与 URL 目标', () => {
  it('appId 拒绝穿越与分隔符', () => {
    expect(isSafeSegment('demo-packaged')).toBe(true)
    expect(isSafeSegment('../etc')).toBe(false)
    expect(isSafeSegment('a/b')).toBe(false)
    expect(isSafeSegment('..')).toBe(false)
    expect(isSafeSegment('/abs')).toBe(false)
    expect(isSafeSegment('')).toBe(false)
    expect(() => assertSafeSegment('../../x', 'appId')).toThrow(/unsafe/)
  })

  it('assertAllowedUrl 拒绝非授信源站', () => {
    expect(() => assertAllowedUrl('https://a.com/x', ['https://a.com'])).not.toThrow()
    expect(() => assertAllowedUrl('https://a.com.evil.com/x', ['https://a.com'])).toThrow(/origin not allowed/)
  })

  it('assertFetchableUrl 拒绝非 http(s)、非授信源站', () => {
    expect(() => assertFetchableUrl('file:///etc/passwd', ['https://a.com'])).toThrow(/protocol/)
    expect(() => assertFetchableUrl('https://evil.com/x', ['https://a.com'])).toThrow(/origin not allowed/)
    expect(assertFetchableUrl('https://a.com/f.pdf', ['https://a.com']).hostname).toBe('a.com')
  })

  it('isPrivateHost 覆盖回环、私有段、元数据地址', () => {
    for (const host of ['127.0.0.1', 'localhost', '169.254.169.254', '10.1.2.3', '192.168.1.1', '172.16.0.1', '172.31.255.255', '::1']) {
      expect(isPrivateHost(host), host).toBe(true)
    }
    for (const host of ['8.8.8.8', 'a.com', '172.32.0.1', '192.169.1.1']) {
      expect(isPrivateHost(host), host).toBe(false)
    }
  })
})
