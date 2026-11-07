/**
 * 域 SPI：平台只认识这个接口，不认识任何具体域。
 * 每个硬件域用 defineDomain 自描述，注册表自动聚合——注册是数据，不是代码。
 */
import type { z } from 'zod'

/**
 * 输入 schema 的最小结构约束（兼容 zod v4）。
 * 不直接写 z.ZodType<TInput>：zod v4 的 safeParse 返回 core.output<this>（延迟 this 类型），
 * TS 无法从 z.object(...) 反推出 TInput（恒为 unknown），handler 参数失去类型。
 * 改为让 schema 本体作为类型参数传递，入参类型用条件类型从 safeParse 返回形状提取。
 */
export type DomainInputLike = {
  safeParse(data: unknown, params?: unknown): { success: true, data: any } | { success: false, error: any }
}

/** 从输入 schema 提取 handler 入参类型（schema 产出 = 校验通过后的 data） */
export type InferDomainInput<T> = T extends {
  safeParse(...args: any[]): { success: true, data: infer D } | { success: false }
} ? D : unknown

/** 域方法：输入输出都是 zod schema（桥接层据此做运行时校验 + 类型推导） */
export interface DomainMethodDef<TIn extends DomainInputLike = DomainInputLike, TOutput = unknown> {
  input: TIn
  output: z.ZodType<any, any, any>
  /** 所需权限（PermissionService 按此放行） */
  grant?: string
  handler: (input: InferDomainInput<TIn>, ctx: DomainCallContext) => TOutput | Promise<TOutput>
}

export interface DomainCallContext {
  appId: string
  instanceId: string
  /** 日志作用域已含域前缀（domain:<name>） */
  log: (message: string, fields?: Record<string, unknown>) => void
}

export interface DomainDefinition {
  name: string
  methods: Record<string, DomainMethodDef>
}

export function defineDomain<const N extends string, const M extends Record<string, DomainMethodDef>>(
  name: N,
  methods: M,
): DomainDefinition & { name: N, methods: M } {
  return { name, methods }
}

/** 域方法表类型推导：供 shell-bridge 生成渲染层类型化调用端 */
export type DomainApi<D extends DomainDefinition> = {
  [M in keyof D['methods']]: D['methods'][M] extends DomainMethodDef<infer S, infer O>
    ? (input: InferDomainInput<S>) => Promise<Awaited<O>>
    : never
}
