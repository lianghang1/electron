/**
 * 调用管线：权限 → 校验 → 仲裁 → 超时 → 调用 → 错误归一 → 打点 → 释放。
 * 六个能力域的每一次外部调用都经过唯一入口，横切逻辑只实现一次。
 */
import type { LeaseOwner, LeaseRegistry } from './session'
import type { DeviceTelemetry } from './telemetry'
import { deviceError, toDeviceError } from './errors'

/** 结构化入参校验契约：zod schema 天然满足，避免绑定具体库的泛型参数。 */
export interface InputSchema<I> {
  safeParse: (input: unknown) => { success: true, data: I } | { success: false, error: { flatten: () => unknown } }
}

export interface InvocationContext {
  readonly capabilityId: string
  readonly methodName: string
  readonly appId: string
  readonly instanceId: string
  /** 参与租约仲裁的设备；不需要独占设备时留空 */
  readonly deviceId?: string
}

export interface InvocationStep<I, O> {
  readonly input: InputSchema<I>
  readonly grant?: string
  readonly handle: (input: I, ctx: InvocationContext) => O | Promise<O>
  readonly timeoutMs?: number
}

export interface PipelineOptions {
  readonly leases: LeaseRegistry
  readonly telemetry: DeviceTelemetry
  readonly authorize?: (grant: string, ctx: InvocationContext) => Promise<boolean> | boolean
  readonly now?: () => number
}

export interface InvocationPipeline {
  run: <I, O>(ctx: InvocationContext, input: unknown, step: InvocationStep<I, O>) => Promise<O>
}

function withTimeout<T>(task: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(deviceError('TIMEOUT', `调用超时：${label}`, { timeoutMs: ms })), ms)
    task.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

export function createInvocationPipeline(options: PipelineOptions): InvocationPipeline {
  const now = options.now ?? Date.now

  return {
    async run(ctx, rawInput, step) {
      const startedAt = now()
      let leaseId: string | undefined
      let ok = false
      let errorCode: ReturnType<typeof toDeviceError>['code'] | undefined

      try {
        if (step.grant && options.authorize && !(await options.authorize(step.grant, ctx))) {
          throw deviceError('PERMISSION_DENIED', `权限未放行：${ctx.appId} → ${step.grant}`)
        }

        const parsed = step.input.safeParse(rawInput)
        if (!parsed.success) {
          throw deviceError('INVALID_INPUT', `入参校验失败：${ctx.methodName}`, parsed.error.flatten())
        }

        if (ctx.deviceId) {
          const owner: LeaseOwner = { appId: ctx.appId, instanceId: ctx.instanceId }
          leaseId = options.leases.acquire(owner, ctx.capabilityId, ctx.deviceId).leaseId
        }

        const call = Promise.resolve().then(() => step.handle(parsed.data, ctx))
        const result = step.timeoutMs
          ? await withTimeout(call, step.timeoutMs, ctx.methodName)
          : await call
        ok = true
        return result
      }
      catch (err) {
        const normalized = toDeviceError(err)
        errorCode = normalized.code
        throw normalized
      }
      finally {
        if (leaseId) { options.leases.release(leaseId) }
        options.telemetry.record({
          capabilityId: ctx.capabilityId,
          methodName: ctx.methodName,
          appId: ctx.appId,
          startedAt,
          durationMs: now() - startedAt,
          ok,
          errorCode,
        })
      }
    },
  }
}
