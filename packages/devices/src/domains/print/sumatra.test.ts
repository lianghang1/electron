import { describe, expect, it } from 'vitest'
import { selectSumatraPdfFile, SUMATRA_PDF_ARM64_FILE, SUMATRA_PDF_FILE } from './sumatra'

describe('按宿主架构选择 PDF 送打资产', () => {
  it('x64 使用 win64 构建', () => {
    expect(selectSumatraPdfFile('x64', () => true)).toBe(SUMATRA_PDF_FILE)
  })

  it('arm64 且原生构建就位时优先选用', () => {
    expect(selectSumatraPdfFile('arm64', rel => rel === SUMATRA_PDF_ARM64_FILE)).toBe(SUMATRA_PDF_ARM64_FILE)
  })

  it('arm64 但原生构建缺失时回退 win64', () => {
    expect(selectSumatraPdfFile('arm64', () => false)).toBe(SUMATRA_PDF_FILE)
  })

  it('未识别架构不误选原生构建', () => {
    expect(selectSumatraPdfFile('ia32', () => true)).toBe(SUMATRA_PDF_FILE)
  })
})
