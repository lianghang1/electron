/**
 * 更新版本比较（>0: a 新于 b）：semver 规则。
 * 核心数字段逐段比较，缺段按 '0' 补齐（'1.0' 与 '1.0.0' 相等）；
 * 核心相等时带预发布的更旧（'1.0.0-beta' < '1.0.0'），预发布标识符逐段比较——
 * 数值段比数值、字母段比字典序、数值段恒旧于字母段、前缀相同段少者旧；
 * '+ 构建元数据' 忽略。绝不返回 NaN——NaN 会让"清单是否更新"的判定失效
 * （每次启动重复下载）。
 * launcher（packages/core/launcher，CJS 独立实现）保持同一规则，改动需两侧同步，
 * 一致性由 packages/core/test/version-consistency.test.ts 强制。
 */
export function compareVersions(a: string, b: string): number {
  const [coreA, preA] = splitRelease(String(a))
  const [coreB, preB] = splitRelease(String(b))
  const pa = coreA.split('.')
  const pb = coreB.split('.')
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const av = pa[i] ?? '0'
    const bv = pb[i] ?? '0'
    const an = Number.parseInt(av, 10)
    const bn = Number.parseInt(bv, 10)
    if (!Number.isNaN(an) && !Number.isNaN(bn)) {
      if (an !== bn) { return an - bn }
    }
    else if (av !== bv) {
      return av < bv ? -1 : 1
    }
  }
  return comparePreRelease(preA, preB)
}

/** 拆分 semver 形状：核心段（第一个 '-' 之前）与预发布段分离，'+ 构建元数据' 忽略 */
function splitRelease(version: string): [string, string] {
  const withoutBuild = version.split('+')[0] ?? version
  const dashIndex = withoutBuild.indexOf('-')
  if (dashIndex === -1) { return [withoutBuild, ''] }
  return [withoutBuild.slice(0, dashIndex), withoutBuild.slice(dashIndex + 1)]
}

/**
 * 预发布序（semver）：无预发布 = 正式版，新于任何预发布；两侧都有预发布则逐段比较——
 * 纯数字段比数值、字母段比字典序、数值段恒旧于字母段、前缀相同段少者旧。
 */
function comparePreRelease(a: string, b: string): number {
  if (!a && !b) { return 0 }
  if (!a) { return 1 }
  if (!b) { return -1 }
  const pa = a.split('.')
  const pb = b.split('.')
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const av = pa[i]
    const bv = pb[i]
    if (av === undefined) { return -1 }
    if (bv === undefined) { return 1 }
    const an = /^\d+$/.test(av)
    const bn = /^\d+$/.test(bv)
    if (an && bn) {
      const diff = Number.parseInt(av, 10) - Number.parseInt(bv, 10)
      if (diff !== 0) { return diff }
    }
    else if (an !== bn) {
      return an ? -1 : 1
    }
    else if (av !== bv) {
      return av < bv ? -1 : 1
    }
  }
  return 0
}
