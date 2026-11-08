import type { EventBus } from '@shell/kernel'
import type { Logger } from '@shell/kernel/logger'
import type { DomainCallContext, DomainDefinition } from '@shell/shared'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * 域装配公共基座：路由、错误、共享 helper。
 * 六个域各自 defineDomain，只依赖本文件；gateway 退化为「建系统 + 查表收域」。
 */

export type DomainErrorCode = 'METHOD_NOT_FOUND' | 'INVALID_INPUT' | 'DEVICE_NOT_FOUND' | 'DOMAIN_UNAVAILABLE'

export class DomainRouteError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message)
  }
}

/** 域工厂共用现场数据：事件总线（流式数据广播）与打包标记（诊断方法门禁） */
export interface DomainDeps {
  events: EventBus
  isPackaged: boolean
}

/** 域调用路由："<域>.<方法>" → 能力闸门 → zod 校验 → handler */
export interface DomainRouter {
  call: (method: string, input: unknown, ctx: DomainCallContext) => Promise<unknown>
}

/**
 * availableDomains：能力矩阵接线点（M4-B）。
 * 不在该平台能力清单内的域，调用在路由层即被拒绝——业务页/JSAPI 无需自行判断平台，
 * 平台差异由组合根探测一次后经此闸门生效，域内部零感知。
 */
export function createDomainRouter(
  domains: DomainDefinition[],
  logger: Logger,
  availableDomains?: readonly string[],
): DomainRouter {
  const table = new Map<string, DomainDefinition['methods'][string]>()
  for (const domain of domains) {
    for (const [name, def] of Object.entries(domain.methods)) { table.set(`${domain.name}.${name}`, def) }
  }

  return {
    async call(method, input, ctx) {
      const started = Date.now()
      const domain = method.split('.')[0] ?? ''
      if (availableDomains && !availableDomains.includes(domain)) {
        throw new DomainRouteError('DOMAIN_UNAVAILABLE', `当前平台未启用设备域：${domain}`)
      }
      const def = table.get(method)
      if (!def) { throw new DomainRouteError('METHOD_NOT_FOUND', `未注册的域方法：${method}`) }

      const parsed = def.input.safeParse(input)
      if (!parsed.success) { throw new DomainRouteError('INVALID_INPUT', `入参校验失败：${method}`, parsed.error.flatten()) }

      try {
        return await def.handler(parsed.data as never, ctx)
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
