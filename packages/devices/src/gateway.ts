import type { Logger } from '@shell/kernel/logger'
import type { DomainCallContext, DomainDefinition } from '@shell/shared'
import { z } from 'zod'
import { DeviceHost } from './host/device-host'
import { createIdCardSystem } from './domains/idcard'

/**
 * 设备网关：主进程侧的域方法装配与调用路由（铁律二）。
 * - 域接入 = 本文件一个适配块（zod 契约 + handler 映射），域内部系统零改动
 * - 渲染层经 bridge 的 'domain-call' 进来，router 按 "<域>.<方法>" 分发，
 *   输入经 zod 校验后才触达 handler（渲染层传参不可信）
 * - DLL 调用经 DeviceHost 进 utilityProcess，native 崩溃隔离 + 退避自愈
 *
 * M4 迁移清单：print / iccard / scanner / capture / signature 按本文件 idcard
 * 模板各加一个适配块；setConfig 的 sanitizeOverrides（旧 core/src/ipc/device-profile）
 * 在迁移时一并平移到对应域 errors 旁。
 */

export interface DeviceGatewayOptions {
  logger: Logger
  /** 守护进程入口 js（out/main/device-host.js，与主进程 bundle 同目录） */
  hostEntryPath: string
  /** 厂商 SDK 资源根（DLL 等，dev / 打包差异由宿主解析） */
  resourcesRoot: string
}

export interface DeviceGateway {
  /** 注册进组合根的域方法表 */
  domains: DomainDefinition[]
  /** 预热守护进程（含 koffi 加载）；完成即打 t2DeviceHostReady */
  warmup(onReady: () => void): Promise<void>
  dispose(): void
}

/** 域调用路由："<域>.<方法>" → zod 校验 + handler 分发（组合根把它接到 ipcMain） */
export interface DomainRouter {
  call(method: string, input: unknown, ctx: DomainCallContext): Promise<unknown>
}

export class DomainRouteError extends Error {
  constructor(
    readonly code: 'METHOD_NOT_FOUND' | 'INVALID_INPUT' | 'DEVICE_NOT_FOUND',
    message: string,
    readonly detail?: unknown,
  ) {
    super(message)
  }
}

export function createDomainRouter(domains: DomainDefinition[], logger: Logger): DomainRouter {
  const table = new Map<string, DomainDefinition['methods'][string]>()
  for (const domain of domains) {
    for (const [name, def] of Object.entries(domain.methods))
      table.set(`${domain.name}.${name}`, def)
  }

  return {
    async call(method, input, ctx) {
      const started = Date.now()
      const def = table.get(method)
      if (!def)
        throw new DomainRouteError('METHOD_NOT_FOUND', `未注册的域方法：${method}`)

      const parsed = def.input.safeParse(input)
      if (!parsed.success)
        throw new DomainRouteError('INVALID_INPUT', `入参校验失败：${method}`, parsed.error.flatten())

      try {
        return await def.handler(parsed.data as never, ctx)
      }
      finally {
        logger.debug('domain call', { method, ms: Date.now() - started })
      }
    },
  }
}

export function createDeviceGateway(options: DeviceGatewayOptions): DeviceGateway {
  const log = options.logger.scope('devices')
  const host = new DeviceHost(options.logger, options.hostEntryPath)

  const idcard = createIdCardSystem({
    resourcesRoot: options.resourcesRoot,
    host,
    logger: options.logger.scope('devices:idcard'),
  })

  const domains: DomainDefinition[] = [
    defineDomain('idcard', {
      listReaders: {
        input: z.undefined().optional(),
        output: z.unknown(),
        handler: () => idcard.listReaders(),
      },
      read: {
        // deviceId 缺省 = 自动选用第一个就绪的读卡器（沿用旧域通道的定位语义）
        input: z.object({ deviceId: z.string().optional() }),
        output: z.unknown(),
        handler: async (input) => {
          const deviceId = input.deviceId
            ?? (await idcard.listReaders()).find(reader => reader.status === 'ready')?.id
          if (!deviceId)
            throw new DomainRouteError('DEVICE_NOT_FOUND', '无可用身份证阅读器')
          return idcard.read({ deviceId })
        },
      },
      getConfig: {
        input: z.undefined().optional(),
        output: z.unknown(),
        handler: () => idcard.getConfig(),
      },
      setConfig: {
        // 档案制配置：按档案 id 提交白名单覆盖（sanitize 在 M4 随域迁移补上）
        input: z.object({ id: z.string(), overrides: z.record(z.string(), z.unknown()) }),
        output: z.unknown(),
        handler: ({ id, overrides }) => idcard.setConfig(id, overrides as never),
      },
    }),
  ]

  return {
    domains,

    warmup(onReady) {
      return host.warmup().then(() => {
        onReady()
      })
    },

    dispose() {
      idcard.destroy()
      host.dispose()
      log.info('device gateway disposed')
    },
  }
}
