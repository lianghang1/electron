/**
 * 更新版本比较（>0: a 新于 b）：数字段逐段比较，缺段按 '0' 补齐（'1.0' 与 '1.0.0' 相等），
 * 非数字段（预发布后缀）退化为字符串比较。绝不返回 NaN——NaN 会让"清单是否更新"的判定失效
 * （每次启动重复下载）。
 * launcher（packages/core/launcher，CJS 独立实现）保持同一规则，改动需两侧同步
 * （CJS/TS 模块边界无法共享，热更链路里两侧各有一份）。
 */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).split(/[.-]/)
  const pb = String(b).split(/[.-]/)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const av = pa[i] ?? '0'
    const bv = pb[i] ?? '0'
    const an = Number.parseInt(av, 10)
    const bn = Number.parseInt(bv, 10)
    if (!Number.isNaN(an) && !Number.isNaN(bn)) {
      if (an !== bn)
        return an - bn
    }
    else if (av !== bv) {
      return av < bv ? -1 : 1
    }
  }
  return 0
}
