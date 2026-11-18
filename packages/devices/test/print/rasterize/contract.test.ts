import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { assertRasterizeConfig, resolveRasterizeConfig } from '../../../src/domains/print/rasterize/contract.ts'

function invalid(raw: unknown, match: RegExp): void {
  assert.throws(() => assertRasterizeConfig(raw), (err: Error & { code?: string }) => {
    assert.equal(err.code, 'VALIDATION_FAILED')
    assert.match(err.message, match)
    return true
  })
}

describe('resolveRasterizeConfig 缺省值（Java Config 字段初始化）', () => {
  it('空入参 → dpi=300 / png / 0.9 / portrait / center / margin 0 / content 0 / 不拉伸 / paper 缺省', () => {
    assert.deepEqual(resolveRasterizeConfig({}), {
      paper: undefined,
      orientation: 'portrait',
      alignment: 'center',
      marginMM: 0,
      contentWidthMM: 0,
      contentHeightMM: 0,
      contentStretch: false,
      dpi: 300,
      outputFormat: 'png',
      jpegQuality: 0.9,
    })
    assert.deepEqual(resolveRasterizeConfig(assertRasterizeConfig(undefined)).dpi, 300)
  })
})

describe('assertRasterizeConfig 校验（Java Config.validate 逐条对齐）', () => {
  it('dpi 越界与非整数', () => {
    invalid({ dpi: 71 }, /DPI 必须在 72-1200 之间: 71/)
    invalid({ dpi: 1201 }, /DPI 必须在 72-1200 之间: 1201/)
    invalid({ dpi: 300.5 }, /DPI 须为整数/)
    assertRasterizeConfig({ dpi: 72 })
    assertRasterizeConfig({ dpi: 1200 })
  })

  it('marginMM 负数', () => {
    invalid({ marginMM: -1 }, /marginMM 不能为负数: -1/)
  })

  it('contentWidthMM / contentHeightMM 成对校验', () => {
    invalid({ contentWidthMM: 100 }, /必须同时设置或同时为 0: 100 x 0/)
    invalid({ contentHeightMM: 100 }, /必须同时设置或同时为 0: 0 x 100/)
    // Java validate 顺序：一正一负先报不成对
    invalid({ contentWidthMM: 100, contentHeightMM: -5 }, /必须同时设置或同时为 0/)
    invalid({ contentWidthMM: -5, contentHeightMM: -10 }, /内容尺寸不能为负数/)
    assertRasterizeConfig({ contentWidthMM: 100, contentHeightMM: 100 })
  })

  it('jpegQuality 仅在 outputFormat=jpeg 时校验（Java 语义）', () => {
    invalid({ outputFormat: 'jpeg', jpegQuality: 0 }, /jpegQuality 必须在 \(0, 1\] 之间: 0/)
    invalid({ outputFormat: 'jpeg', jpegQuality: 1.1 }, /jpegQuality 必须在 \(0, 1\] 之间/)
    assertRasterizeConfig({ outputFormat: 'jpeg', jpegQuality: 1 })
    // 缺省格式为 PNG：jpegQuality 不校验
    assertRasterizeConfig({ jpegQuality: 0 })
  })

  it('paper 须为固定纸型（连续纸拒绝）', () => {
    invalid({ paper: { widthMm: 210, heightMm: 0 } }, /连续卷纸不适用于栅格化/)
    invalid({ paper: { widthMm: 0, heightMm: 297 } }, /连续卷纸不适用于栅格化/)
    assertRasterizeConfig({ paper: { widthMm: 210, heightMm: 297 } })
  })

  it('strict 拒绝未知键（字段名拼写错误不留静默）', () => {
    invalid({ dpi: 300, orientationn: 'portrait' }, /orientationn/)
  })

  it('完整合法入参 resolve 后字段齐备', () => {
    const cfg = assertRasterizeConfig({
      paper: { widthMm: 80, heightMm: 120 },
      orientation: 'auto',
      alignment: 'top',
      marginMM: 5,
      contentWidthMM: 60,
      contentHeightMM: 40,
      contentStretch: true,
      dpi: 600,
      outputFormat: 'jpeg',
      jpegQuality: 0.95,
    })
    assert.deepEqual(cfg, {
      paper: { widthMm: 80, heightMm: 120 },
      orientation: 'auto',
      alignment: 'top',
      marginMM: 5,
      contentWidthMM: 60,
      contentHeightMM: 40,
      contentStretch: true,
      dpi: 600,
      outputFormat: 'jpeg',
      jpegQuality: 0.95,
    })
  })
})
