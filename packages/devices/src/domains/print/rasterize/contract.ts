import type { PaperSpec, PrintRasterizeOptions } from '@shell/shared'
import { z } from 'zod'
import { printError } from '../errors'

/**
 * PDF 栅格化（防丢字）可选参数契约：conflux PdfImageConverter.Config 的逐字段移植，
 * 字段语义与缺省值与 Java 侧一致；校验规则逐条对齐 Config.validate()（Java L165-182）。
 */

export type RasterizeOrientation = 'portrait' | 'landscape' | 'auto'
export type RasterizeAlignment = 'top' | 'center' | 'bottom'
export type RasterizeOutputFormat = 'png' | 'jpeg'

/** 栅格化纸型须为固定纸：连续卷纸（heightMm = 0）没有可复刻的页面高度，栅格化不适用 */
const rasterizePaperSchema = z.object({
  widthMm: z.number(),
  heightMm: z.number(),
}).refine(p => p.widthMm > 0 && p.heightMm > 0, {
  message: 'rasterize.paper 须为固定纸型：widthMm/heightMm 均须大于 0（连续卷纸不适用于栅格化）',
})

export const rasterizeSchema = z.strictObject({
  /** 目标纸型；缺省 = 模式一：保持每页原始尺寸不缩放（Java targetPaper = null） */
  paper: rasterizePaperSchema.optional(),
  /** 目标方向，仅 paper 非空时生效；auto = 按每页宽高比自动选横/竖 */
  orientation: z.enum(['portrait', 'landscape', 'auto']).optional(),
  /** 内容在画布中的垂直对齐（水平恒居中） */
  alignment: z.enum(['top', 'center', 'bottom']).optional(),
  marginMM: z.number().optional(),
  contentWidthMM: z.number().optional(),
  contentHeightMM: z.number().optional(),
  contentStretch: z.boolean().optional(),
  /** 渲染 DPI：整数（Java int 字段） */
  dpi: z.number().int({ message: 'DPI 须为整数' }).optional(),
  outputFormat: z.enum(['png', 'jpeg']).optional(),
  jpegQuality: z.number().optional(),
  /** strict 拒绝未知键：字段名拼写错误若被静默忽略，打印结果会偏离预期且难排查 */
}).superRefine((cfg, ctx) => {
  if (cfg.dpi != null && (cfg.dpi < 72 || cfg.dpi > 1200)) {
    ctx.addIssue({ code: 'custom', message: `DPI 必须在 72-1200 之间: ${cfg.dpi}`, path: ['dpi'] })
  }
  if (cfg.marginMM != null && cfg.marginMM < 0) {
    ctx.addIssue({ code: 'custom', message: `marginMM 不能为负数: ${cfg.marginMM}`, path: ['marginMM'] })
  }
  // Java validate 顺序：先不成对后负数（一正一负报不成对，双负报负数）
  const cw = cfg.contentWidthMM
  const ch = cfg.contentHeightMM
  if (cw != null && ch != null && (cw > 0) !== (ch > 0)) {
    ctx.addIssue({ code: 'custom', message: `contentWidthMM 与 contentHeightMM 必须同时设置或同时为 0: ${cw} x ${ch}`, path: ['contentWidthMM'] })
  }
  else if (cw != null && ch != null && (cw < 0 || ch < 0)) {
    ctx.addIssue({ code: 'custom', message: `内容尺寸不能为负数: ${cw} x ${ch}`, path: ['contentWidthMM'] })
  }
  else if (cw != null && ch == null) {
    ctx.addIssue({ code: 'custom', message: `contentWidthMM 与 contentHeightMM 必须同时设置或同时为 0: ${cw} x 0`, path: ['contentWidthMM'] })
  }
  else if (cw == null && ch != null) {
    ctx.addIssue({ code: 'custom', message: `contentWidthMM 与 contentHeightMM 必须同时设置或同时为 0: 0 x ${ch}`, path: ['contentHeightMM'] })
  }
  // Java 仅在 outputFormat = JPEG 时校验（Config 字段默认值 0.9 恒合法）；缺省格式为 PNG，同样不校验
  if (cfg.outputFormat === 'jpeg' && cfg.jpegQuality != null && !(cfg.jpegQuality > 0 && cfg.jpegQuality <= 1)) {
    ctx.addIssue({ code: 'custom', message: `jpegQuality 必须在 (0, 1] 之间: ${cfg.jpegQuality}`, path: ['jpegQuality'] })
  }
})

/** 调用方传入的 rasterize 形态（全部字段可选）：单一事实来源在 shared 契约，schema 为校验器 */
export type RasterizeInput = PrintRasterizeOptions

/** 补齐缺省值后的完整配置（缺省值 = Java Config 字段初始化，L134-163） */
export interface RasterizeConfig {
  /** undefined = 保持每页原始尺寸（模式一） */
  paper?: PaperSpec
  orientation: RasterizeOrientation
  alignment: RasterizeAlignment
  marginMM: number
  /** 0 = 未指定内容尺寸（Java 字段语义） */
  contentWidthMM: number
  contentHeightMM: number
  contentStretch: boolean
  dpi: number
  outputFormat: RasterizeOutputFormat
  jpegQuality: number
}

/** 缺省值即 Java Config 字段初始化：dpi=300 / PNG / 0.9 / portrait / center / margin 0 / content 0 / 不拉伸 */
export function resolveRasterizeConfig(input: RasterizeInput): RasterizeConfig {
  return {
    paper: input.paper,
    orientation: input.orientation ?? 'portrait',
    alignment: input.alignment ?? 'center',
    marginMM: input.marginMM ?? 0,
    contentWidthMM: input.contentWidthMM ?? 0,
    contentHeightMM: input.contentHeightMM ?? 0,
    contentStretch: input.contentStretch ?? false,
    dpi: input.dpi ?? 300,
    outputFormat: input.outputFormat ?? 'png',
    jpegQuality: input.jpegQuality ?? 0.9,
  }
}

/** 校验并补齐 rasterize 参数；非法输入收敛为 VALIDATION_FAILED（错误消息逐条对齐 Java validate） */
export function assertRasterizeConfig(raw: unknown): RasterizeConfig {
  const parsed = rasterizeSchema.safeParse(raw ?? {})
  if (!parsed.success) {
    const messages = parsed.error.issues.map(issue => issue.message).join('；')
    throw printError('VALIDATION_FAILED', `rasterize 参数不合法：${messages}`, raw)
  }
  return resolveRasterizeConfig(parsed.data)
}
