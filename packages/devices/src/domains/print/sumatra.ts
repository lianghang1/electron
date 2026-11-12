/**
 * SumatraPDF 出厂位置（相对宿主资源根；PDF 打印后端外置 exe）。
 * 资产源 packages/devices/src/domains/print/assets/win64/。
 */
export const SUMATRA_PDF_FILE = 'devices/print/win64/SumatraPDF.exe'

/** ARM64 原生构建的可选位置；未随包提供时组合根回退到 win64 构建。 */
export const SUMATRA_PDF_ARM64_FILE = 'devices/print/win-arm64/SumatraPDF.exe'

/** 目标架构 → 实际资产声明；只在原生构建确实就位时才选用。 */
export function selectSumatraPdfFile(arch: string, fileExists: (rel: string) => boolean): string {
  return arch === 'arm64' && fileExists(SUMATRA_PDF_ARM64_FILE)
    ? SUMATRA_PDF_ARM64_FILE
    : SUMATRA_PDF_FILE
}
