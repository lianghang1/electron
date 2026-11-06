/**
 * 域 SPI：平台只认识这个接口，不认识任何具体域。
 * 每个硬件域用 defineDomain 自描述，注册表自动聚合——注册是数据，不是代码。
 */
import type { z } from 'zod'

/** 域方法：输入输出都是 zod schema（桥接层据此做运行时校验 + 类型推导） */
export interface DomainMethodDef<TInput = unknown, TOutput = unknown> {
  input: z.ZodType<TInput>
  output: z.ZodType<TOutput>
  /** 所需权限（PermissionService 按此放行） */
  grant?: string
  handler: (input: TInput, ctx: DomainCallContext) => Promise<TOutput>
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

export function defineDomain<const D extends DomainDefinition>(domain: D): D {
  return domain
}

/** 域方法表类型推导：供 shell-bridge 生成渲染层类型化调用端 */
export type DomainApi<D extends DomainDefinition> = {
  [M in keyof D['methods']]: D['methods'][M] extends DomainMethodDef<infer I, infer O>
    ? (input: I) => Promise<O>
    : never
}
