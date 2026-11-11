import type { EventBus } from '@shell/kernel'
import type { DomainCallContext, DomainDefinition } from '@shell/shared'
import type { DeviceCallRecord, DeviceObservationSink, DeviceTelemetry } from './runtime/telemetry'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { domainGrant } from '@shell/shared'
import { DeviceError } from './runtime/errors'

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

/** 演示模式：平台级运行时开关，由诊断台切换；仿真注入类方法据此放行。 */
export interface DemoModeState {
  enabled: boolean
}

/** 域工厂共用现场数据：事件总线（流式数据广播）与共享演示模式状态。 */
export interface DomainDeps {
  events: EventBus
  demoMode: DemoModeState
}

/** 域调用路由："<域>.<方法>" → 能力闸门 → zod 校验 → handler */
export interface DomainRouter {
  call: (method: string, input: unknown, ctx: DomainCallContext) => Promise<unknown>
}

/** 路由层只用到 debug 打点，接受任意具备该方法的日志实现。 */
export interface RouterLogger {
  debug: (message: string, metadata?: Record<string, unknown>) => void
}

export interface DomainRouterOptions {
  /** 能力矩阵闸门：不在该平台清单内的域在路由层即被拒绝，域内部零感知 */
  availableDomains?: readonly string[]
  /** 授权闸门：按方法声明的 grant（缺省按域推导）判定，返回 false 即拒绝 */
  authorize?: (grant: string, ctx: DomainCallContext) => Promise<boolean>
  /** 观测底座：每次域调用统一打点，六域共用一份汇总 */
  telemetry?: DeviceTelemetry
  /** 观测输出：打点后把单条记录与汇总快照推给事件总线 */
  observation?: DeviceObservationSink
}

/** 跨域错误码归一：路由层、设备层、宿主层的 code 都以字符串回传观测。 */
function readErrorCode(err: unknown): string | undefined {
  if (err instanceof DomainRouteError) { return err.code }
  if (err instanceof DeviceError) { return err.code }
  if (err && typeof err === 'object' && 'code' in err) {
    const value = (err as { code?: unknown }).code
    return typeof value === 'string' ? value : undefined
  }
  return undefined
}

/** "<域>.<方法>" → 能力闸门 → 授权闸门 → zod 校验 → handler，四道关全在此唯一入口 */
export function createDomainRouter(
  domains: DomainDefinition[],
  logger: RouterLogger,
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
      const methodName = method.split('.')[1] ?? method
      let ok = false
      let errorCode: string | undefined
      try {
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

        const result = await entry.def.handler(parsed.data, ctx)
        ok = true
        return result
      }
      catch (err) {
        errorCode = readErrorCode(err)
        throw err
      }
      finally {
        const durationMs = Date.now() - started
        logger.debug('domain call', { method, ms: durationMs })
        const record: DeviceCallRecord = {
          capabilityId: domain,
          methodName,
          appId: ctx.appId,
          startedAt: started,
          durationMs,
          ok,
          errorCode,
        }
        options.telemetry?.record(record)
        options.observation?.publish({ kind: 'call', record })
        if (options.telemetry && options.observation) {
          options.observation.publish({ kind: 'snapshot', snapshot: options.telemetry.snapshot() })
        }
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
