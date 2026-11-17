import type { IpcInvokeEnvelope, ShellBridge } from '@shell/shared/ipc'
import { IpcRemoteError, shellDomains } from '@shell/shared/ipc'

declare global {
  interface Window {
    /**
     * 原始桥面（preload 注入）。invoke 方法运行时返回 IpcInvokeEnvelope——
     * contextBridge 会把隔离世界抛出的 Error 克隆为裸 Error（code/details/name
     * 全部剥离），因此远程错误以信封 plain object 穿越，业务一律经 shell() 消费
     * （此处解包重建 throwing Promise 与错误对象）。
     */
    shell: ShellBridge
  }
}

/** 信封守卫：仅识别 preload 信封形状，其他返回值（同步方法/推送）原样透传 */
function isEnvelope(value: unknown): value is IpcInvokeEnvelope {
  if (typeof value !== 'object' || value === null) { return false }
  const box = value as { ok?: unknown, value?: unknown, error?: unknown }
  if (box.ok === true) { return 'value' in box }
  return box.ok === false && 'error' in box
}

/** 解包信封为 throwing Promise：远程错误在主世界重建 IpcRemoteError（业务按错误码分支） */
function unwrap(promise: Promise<unknown>): Promise<unknown> {
  return promise.then((value) => {
    if (!isEnvelope(value)) { return value }
    return value.ok ? value.value : Promise.reject(new IpcRemoteError(value.error))
  })
}

/** 与 ShellBridge 类型面同构的解包视图：仅 invoke 方法经信封解包，其余成员引用透传 */
let bridge: ShellBridge | null = null

function buildBridge(): ShellBridge {
  const raw: Record<string, unknown> = window.shell
  const out: Record<string, unknown> = {
    // 设备域通用端与平台事件订阅（契约外根成员）引用透传：invoke 走 domain-call
    // 独立错误编码（[CODE] message，渲染层 normalizeError 按 message 还原），不需信封
    invoke: raw.invoke,
    onEvent: raw.onEvent,
  }
  for (const domain of shellDomains) {
    const origin = domain.root ? raw : (raw[domain.domain] as Record<string, unknown> | undefined)
    if (!origin) { continue }
    if (!domain.root) {
      // 非根域宿主必须新建 plain：contextBridge 分组代理只读，原位改写 invoke 会
      // TypeError（Cannot assign to read only property）。整组成员透传拷贝
      // （含契约外手工成员如 shell.appearance）后再替换 invoke
      const group: Record<string, unknown> = {}
      Object.assign(group, origin)
      out[domain.domain] = group
    }
    else {
      // 根域（system）成员按 defs 键拷到桥面根。绝不整桥拷贝——raw 分组是只读
      // 子代理克隆，会把先前已建的 plain 分组覆盖回代理（信封解包静默失效）
      for (const method of Object.keys(domain.defs)) {
        out[method] = origin[method]
      }
    }
    for (const method of Object.keys(domain.invokeChannels)) {
      const fn = origin[method] as (...args: unknown[]) => Promise<unknown>
      const host = domain.root ? out : (out[domain.domain] as Record<string, unknown>)
      host[method] = (...args: unknown[]) => unwrap(fn(...args))
    }
  }
  return out as ShellBridge
}

export function shell(): ShellBridge {
  if (!window.shell) { throw new Error('shell bridge 不可用：preload 未注入') }
  if (!bridge) { bridge = buildBridge() }
  return bridge
}
