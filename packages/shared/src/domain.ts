/**
 * 域 SPI：平台只认识这个接口，不认识任何具体域。
 * 每个硬件域用 defineDomain 自描述，注册表自动聚合——注册是数据，不是代码。
 * 域方法的入参类型由输入 schema 的 z.output 推导，schema 同时承担运行时校验，
 * 二者同源，无需类型强转。
 */
import type { z } from 'zod'

type AnySchema = z.ZodType<any, any, any>

/** 域方法：input schema 决定 handler 入参类型；output schema 仅作契约声明 */
export interface DomainMethodDef<S extends AnySchema = AnySchema, R = unknown> {
  input: S
  output: AnySchema
  /** 所需授权（权限策略据此判定） */
  grant?: string
  handler: (input: z.output<S>, ctx: DomainCallContext) => R | Promise<R>
}

export interface DomainCallContext {
  appId: string
  instanceId: string
  /** 日志作用域已含域前缀（domain:<name>） */
  log: (message: string, fields?: Record<string, unknown>) => void
}

export interface DomainDefinition {
  name: string
  methods: Record<string, DomainMethodDef<any, any>>
}

export function defineDomain<const N extends string, const M extends Record<string, DomainMethodDef<any, any>>>(
  name: N,
  methods: M,
): DomainDefinition & { name: N, methods: M } {
  return { name, methods }
}

/** 域方法表类型推导：供桥接层生成渲染层类型化调用端 */
export type DomainApi<D extends DomainDefinition> = {
  [K in keyof D['methods']]: D['methods'][K] extends DomainMethodDef<infer S, infer R>
    ? (input: z.output<S>) => Promise<Awaited<R>>
    : never
}
