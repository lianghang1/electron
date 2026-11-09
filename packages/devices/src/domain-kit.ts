import type { EventBus } from '@shell/kernel'
import type { Logger } from '@shell/kernel/logger'
import type { DomainCallContext, DomainDefinition } from '@shell/shared'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { domainGrant } from '@shell/shared'

/**
 * 域装配公共基座：路由、错误、共享 helper。
 * 六个域各自 defineDomain，只依赖本文件；gateway 退化为「建系统 + 查表收域」。
 */

export type DomainErrorCode = 'METHOD_NOT_FOUND' | 'INVALID_INPUT' | 'DEVICE_NOT_FOUND' | 'DOMAIN_UNAVAILABLE' | 'PERMISSION_DENIED'

export class DomainRouteError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message)
  }
}

/** 域工厂共用现场数据：事件总线（流式数据广播）与验机形态标记（诊断方法门禁） */
export interface DomainDeps {
  events: EventBus
  diagnostics: boolean
}

/** 域调用路由："<域>.<方法>" → 能力闸门 → zod 校验 → handler */
export interface DomainRouter {
  call: (method: string, input: unknown, ctx: DomainCallContext) => Promise<unknown>
}

export interface DomainRouterOptions {
  /** 能力矩阵闸门：不在该平台清单内的域在路由层即被拒绝，域内部零感知 */
  availableDomains?: readonly string[]
  /** 授权闸门：按方法声明的 grant（缺省按域推导）判定，返回 false 即拒绝 */
  authorize?: (grant: string, ctx: DomainCallContext) => Promise<boolean>
}

/** "<域>.<方法>" → 能力闸门 → 授权闸门 → zod 校验 → handler，四道关全在此唯一入口 */
export function createDomainRouter(
  domains: DomainDefinition[],
  logger: Logger,
  options: DomainRouterOptions = {},
): DomainRouter {
  const table = new Map<string, { def: DomainDefinition['methods'][string], grant: string }>()
  for (const domain of domains) {
    for (const [name, def] of Object.entries(domain.methods)) {
      table.set(`${domain.name}.${name}`, { def, grant: domainGrant(domain.name, def.grant) })
    }
  }

  return {
    async call(method, input, ctx) {
      const started = Date.now()
      const domain = method.split('.')[0] ?? ''
      if (options.availableDomains && !options.availableDomains.includes(domain)) {
        throw new DomainRouteError('DOMAIN_UNAVAILABLE', `当前平台未启用设备域：${domain}`)
      }
      const entry = table.get(method)
      if (!entry) { throw new DomainRouteError('METHOD_NOT_FOUND', `未注册的域方法：${method}`) }

      if (options.authorize && !(await options.authorize(entry.grant, ctx))) {
        throw new DomainRouteError('PERMISSION_DENIED', `权限未放行：${ctx.appId} → ${entry.grant}`)
      }

      const parsed = entry.def.input.safeParse(input)
      if (!parsed.success) { throw new DomainRouteError('INVALID_INPUT', `入参校验失败：${method}`, parsed.error.flatten()) }

      try {
        return await entry.def.handler(parsed.data, ctx)
      }
      finally {
        logger.debug('domain call', { method, ms: Date.now() - started })
      }
    },
  }
}

/** IC 卡/读卡器定位：deviceId 缺省 = 第一个就绪设备 */
export async function pickReady(devices: { id: string, status: string }[], kind: string): Promise<string> {
  const found = devices.find(d => d.status === 'ready')?.id
  if (!found) { throw new DomainRouteError('DEVICE_NOT_FOUND', `无可用${kind}`) }
  return found
}

/** 单档案覆盖持久化（scanner/capture 域共用形状，各自独立文件） */
export function overridesStore(file: string) {
  return {
    read: <T>(): T | undefined => {
      try {
        return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf-8')) as T) : undefined
      }
      catch {
        return undefined
      }
    },
    write: (value: unknown): void => {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, JSON.stringify(value, null, 2))
    },
  }
}
