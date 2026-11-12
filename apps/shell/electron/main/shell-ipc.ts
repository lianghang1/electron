import type { AppService, PermissionService } from '@shell/app-runtime'
import type { DeviceGateway, DeviceTelemetry, DomainRouter } from '@shell/devices'
import type { AppKvStore, NotificationCenter, PlatformKernel } from '@shell/kernel'
import type { DownloadManager } from '@shell/kernel/download'
import type { Logger } from '@shell/kernel/logger'
import type { AppSessionRegistry } from '@shell/kernel/session'
import type { CallerRegistry, CaptureDialogRequest, CaptureResult, DomainCallContext, FlavorManifest, PlatformCapability } from '@shell/shared'
import type { ForceUpdateGate, UpdateCenter } from '@shell/update'
import type { WindowSystem } from '@shell/window'
import { attachShellHandleLogger, shellHandle, shellOn } from '@shell/bridge/handle'
import { DomainRouteError } from '@shell/devices'
import { registerSettingsIpc } from '@shell/kernel/settings'
import { matchesOrigin, SHELL_APP_ID } from '@shell/shared'
import { app, dialog, ipcMain } from 'electron'

/**
 * 壳设施通道注册（组合根装配后的接线现场）：
 * 契约通道经 shellHandle/shellOn 注册，通道键与签名由 @shell/shared ipc 契约推导
 * （拼错通道名/签名不匹配编译报错），异常经统一出口编码过桥（渲染层还原 code/details）。
 * 设备域与 JSAPI 单通道（domain-call / jsapi:call）不走此包装，保留各自错误语义。
 * 组合根只负责创建与传参；本模块只做注册，不 new 任何系统。
 */

/** 组合根装配完成的系统集合（创建集中在此处消费，依赖单向） */
export interface ShellIpcDeps {
  logger: Logger
  kernel: PlatformKernel
  callers: CallerRegistry
  router: DomainRouter
  apps: AppService
  windows: WindowSystem
  downloads: DownloadManager
  appSessions: AppSessionRegistry
  permissions: PermissionService
  appKv: AppKvStore
  notifications: NotificationCenter
  updateCenter: UpdateCenter | undefined
  forceGate: ForceUpdateGate | undefined
  capability: PlatformCapability
  devices: DeviceGateway
  telemetry: DeviceTelemetry
  flavor: FlavorManifest
  version: () => string
  markGracefulExit: () => void
}

export function registerShellIpc(deps: ShellIpcDeps): void {
  const { logger, kernel, callers, router, apps, windows, downloads, appSessions, permissions, appKv, notifications, updateCenter, forceGate, capability, devices, telemetry, flavor, version, markGracefulExit } = deps
  // 破坏性通道的第一行身份关卡：目标必须是已注册应用
  const assertRegisteredApp = (appId: string): void => {
    if (!apps.list().some(r => r.manifest.id === appId)) { throw new Error(`应用未注册：${appId}`) }
  }
  // 壳设施通道统一经 shellHandle/shellOn 注册：通道键与签名由 @shell/shared ipc
  // 契约推导（拼错通道名/签名不匹配编译报错），异常经统一出口编码过桥（渲染层还原 code/details）。
  // 设备域与 JSAPI 单通道（domain-call / jsapi:call）不走此包装，保留各自错误语义。
  attachShellHandleLogger(logger)

  ipcMain.handle('domain-call', (event, method: string, input: unknown) => {
    const caller = callers.tryResolve(event.sender.id)
    if (!caller) { throw new DomainRouteError('PERMISSION_DENIED', '调用方未登记') }
    const ctx: DomainCallContext = {
      appId: caller.appId,
      instanceId: caller.instanceId,
      log: message => logger.scope('domain').info(message, { method, appId: caller.appId }),
    }
    return router.call(method, input, ctx).catch((err: unknown) => {
      const code = err instanceof DomainRouteError ? err.code : 'DOMAIN_ERROR'
      logger.warn('domain call failed', { method, code, err })
      // 错误码编进 message：IPC 边界只可靠保留 Error.message，调试台据此展示结构化原因
      throw new Error(`[${code}] ${err instanceof Error ? err.message : String(err)}`)
    })
  })

  // 应用运行时通道（open 返回值是 IPC 边界投影：实例内部持有视图/窗口引用，
  // 不可结构化克隆——只出渲染层需要的纯数据）
  shellHandle('apps:list', () => apps.list())
  shellHandle('apps:open', async (_e, appId: string) => {
    const instance = await apps.open(appId)
    return {
      instanceId: instance.instanceId,
      appId: instance.appId,
      state: instance.state,
      handle: { route: instance.handle.route },
    }
  })
  shellHandle('apps:close', (_e, instanceId: string) => apps.close(instanceId))
  shellHandle('apps:activate', (_e, instanceId: string) => windows.activate(instanceId))

  // 下载任务与会话数据：只有壳渲染层持有完整桥面，应用视图拿不到这些通道
  shellHandle('downloads:list', () => downloads.list())
  shellHandle('downloads:cancel', (_e, taskId: string) => downloads.cancel(taskId))
  shellHandle('downloads:open', (_e, taskId: string) => downloads.open(taskId))
  shellHandle('downloads:reveal', (_e, taskId: string) => downloads.reveal(taskId))
  shellHandle('downloads:dismiss', (_e, taskId: string) => downloads.dismiss(taskId))
  shellHandle('sessions:clearCache', async (_e, appId: string) => {
    assertRegisteredApp(appId)
    await appSessions.clearCache(appId)
    kernel.ctx.events.emit('session.cleared', { appId, scope: 'cache' })
  })
  shellHandle('sessions:clearSiteData', async (_e, appId: string) => {
    assertRegisteredApp(appId)
    await appSessions.clearSiteData(appId)
    kernel.ctx.events.emit('session.cleared', { appId, scope: 'site-data' })
  })

  // 壳信息（渲染层按 chrome 档位决定挂不挂壳界面）
  shellHandle('shell:info', () => ({
    name: flavor.name,
    version: version(),
    defaultAppId: flavor.defaultAppId,
    chrome: flavor.mode === 'kiosk' ? 'solo' : flavor.chrome,
    mode: flavor.mode,
    // 门禁快照：渲染层启动即知是否阻断，后续变化经 update.force-required 事件推送
    forceUpdate: forceGate?.snapshot,
    // 能力矩阵下发：业务页按 availableDomains 决定功能可用性，无需自行判断平台
    capabilities: {
      platform: capability.platform,
      availableDomains: [...capability.availableDomains],
      driverDeployment: capability.driverDeployment,
      notes: capability.notes,
    },
    deviceStatus: [...devices.deviceStatuses],
    deviceTelemetry: telemetry.snapshot(),
    // 启动门禁依据：预热未完成时渲染层设备入口进入「初始化中」过渡态（就绪经 devices.ready 事件推送）
    deviceHostReady: kernel.ctx.marks.t2DeviceHostReady !== undefined,
  }))
  // 重启壳：quit 会触发 before-quit，把暂存的整包安装执行掉，再以新版本拉起
  shellHandle('shell:relaunch', () => {
    markGracefulExit()
    app.relaunch()
    app.quit()
  })
  // 门禁页主动更新入口：巡检并应用；需重启时经 update.restart-required 事件回传
  shellHandle('shell:updateNow', () => updateCenter?.checkAndApply())
  // 内容区矩形上报：渲染层两种语义入口（根 reportContentRect 与 tabs.setWorkArea）共用一份布局事实
  shellOn('system:reportContentRect', (_e, rect: { x: number, y: number, width: number, height: number }) =>
    windows.setContentRect(rect))
  shellOn('tabs:setWorkArea', (_e, rect: { x: number, y: number, width: number, height: number }) =>
    windows.setContentRect(rect))

  // JSAPI 受控桥（remote 页面）：账本身份 + origin 白名单双重校验，
  // 域级放行交给路由层授权闸门，不在桥里另写一份 devices 判定
  ipcMain.handle('jsapi:call', (event, method: string, input: unknown) => {
    const caller = callers.tryResolve(event.sender.id)
    if (!caller) { throw new DomainRouteError('PERMISSION_DENIED', '调用方未登记') }
    const frameUrl = event.senderFrame?.url ?? ''
    let origin: string
    try {
      origin = new URL(frameUrl).origin
    }
    catch {
      throw new DomainRouteError('METHOD_NOT_FOUND', '无法解析调用方 origin')
    }
    const found = apps.list().find((r) => {
      const entry = r.manifest.entry
      return r.manifest.id === caller.appId
        && entry.kind === 'remote'
        && matchesOrigin(frameUrl, entry.origins)
    })
    if (!found) {
      logger.warn('jsapi rejected: origin not allowed', { origin, appId: caller.appId, method })
      throw new DomainRouteError('METHOD_NOT_FOUND', 'origin 未授权')
    }
    const ctx: DomainCallContext = {
      appId: caller.appId,
      instanceId: caller.instanceId,
      log: message => logger.scope('jsapi').info(message, { method, appId: caller.appId }),
    }
    return router.call(method, input, ctx).catch((err: unknown) => {
      logger.warn('jsapi call failed', { method, appId: caller.appId, err })
      throw err
    })
  })

  // 桥面通道统一从账本反查身份：页面不能伪造 appId
  const callerOf = (senderId: number) => {
    const caller = callers.tryResolve(senderId)
    if (!caller) { throw new Error('调用方未登记') }
    return caller
  }
  const authorized = async (senderId: number, permission: string): Promise<string> => {
    const caller = callerOf(senderId)
    const allowed = await permissions.decide({
      appId: caller.appId,
      origin: `app://${caller.appId}`,
      permission,
    })
    if (!allowed) { throw new Error(`PERMISSION_DENIED: ${permission}`) }
    return caller.appId
  }

  // App 隔离 KV：解析身份 + 校验 storage 权限，按 appId 分文件
  shellHandle('storage:get', async (e, key: string) => appKv.get(await authorized(e.sender.id, 'storage'), key))
  shellHandle('storage:set', async (e, key: string, value: unknown) => { appKv.set(await authorized(e.sender.id, 'storage'), key, value) })
  shellHandle('storage:remove', async (e, key: string) => { appKv.remove(await authorized(e.sender.id, 'storage'), key) })
  shellHandle('storage:clear', async (e) => { appKv.clear(await authorized(e.sender.id, 'storage')) })
  shellHandle('storage:keys', async e => appKv.keys(await authorized(e.sender.id, 'storage')))
  shellHandle('storage:snapshot', async e => appKv.snapshot(await authorized(e.sender.id, 'storage')))

  // 统一消息通道：toast / 通知中心 / 下载卡共用一份 TTL
  shellHandle('notifications:show', async (e, input: { title: string, body?: string, level?: string, ttlMs?: number }) => {
    await authorized(e.sender.id, 'notification')
    const level = input.level === 'success' || input.level === 'warning' || input.level === 'error' ? input.level : 'info'
    return notifications.push({ title: String(input.title), body: input.body, level, ttlMs: input.ttlMs })
  })
  shellHandle('notifications:dismiss', async (e, id: string) => {
    await authorized(e.sender.id, 'notification')
    notifications.dismiss(id)
  })
  shellHandle('notifications:list', async (e) => {
    await authorized(e.sender.id, 'notification')
    return [...notifications.list()]
  })

  // 更新状态机：install 仅工作台可调用，pending 优先重启
  shellHandle('update:state', () => updateCenter?.getState() ?? { status: 'idle' })
  shellHandle('update:cancel', () => updateCenter?.cancel())
  shellHandle('update:install', async (e) => {
    if (callerOf(e.sender.id).appId !== SHELL_APP_ID) { throw new Error('仅工作台可安装更新') }
    if (updateCenter?.hasPendingRestart()) {
      markGracefulExit()
      app.relaunch()
      app.quit()
      return
    }
    await updateCenter?.checkAndApply()
  })

  // 权限查询只做展示不弹窗；重置授权是工作台的管理动作
  shellHandle('permissions:query', (e, permission: string) => {
    const caller = callerOf(e.sender.id)
    return permissions.check({ appId: caller.appId, origin: `app://${caller.appId}`, permission })
  })
  shellHandle('permissions:list', (e, appId?: string) => permissions.listStates(appId ?? callerOf(e.sender.id).appId))
  shellHandle('permissions:reset', async (e, permission: string) => {
    if (callerOf(e.sender.id).appId !== SHELL_APP_ID) { throw new Error('仅工作台可重置授权') }
    await permissions.resetRuntime(permission)
  })

  // Tab 细粒度：重载指定实例；全屏进出由 WebContentsView 的 HTML5 fullscreen 事件接管
  shellHandle('tabs:reload', (e, instanceId: string) => {
    callerOf(e.sender.id)
    windows.reload(instanceId)
  })

  // 运行时授权：应用主动请求 → 原生浮层询问 → 结论持久化
  shellHandle('permissions:request', (e, permission: string) => {
    const caller = callerOf(e.sender.id)
    return permissions.requestRuntime({ appId: caller.appId, origin: `app://${caller.appId}`, permission })
  })

  // 拍摄浮层会话（master ipc/capture.ts）：发起方身份从账本反查，浮层内操作按窗口归属校验
  const captureDialog = devices.captureDialog
  const pickString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined
  const dialogRequest = (input: unknown): CaptureDialogRequest => {
    const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
    const resolutionNum = Number(raw.resolutionNum)
    const maxCount = Number(raw.maxCount)
    return {
      deviceId: pickString(raw.deviceId),
      deviceLabel: pickString(raw.deviceLabel),
      title: pickString(raw.title),
      resolutionNum: Number.isInteger(resolutionNum) && resolutionNum >= 0 ? resolutionNum : undefined,
      maxCount: Number.isInteger(maxCount) && maxCount >= 1 ? maxCount : undefined,
      format: raw.format === 'jpg' || raw.format === 'png' || raw.format === 'bmp' ? raw.format : undefined,
    }
  }
  const confirmResults = (input: unknown): CaptureResult[] => {
    if (!Array.isArray(input)) { return [] }
    return input.filter((item): item is CaptureResult => {
      const r = item as Partial<CaptureResult> | null
      return !!r && typeof r.imagePath === 'string' && r.imagePath.length > 0
    })
  }
  if (captureDialog) {
    shellHandle('captureDialog:open', (event, input: unknown) => {
      const caller = callerOf(event.sender.id)
      const appName = apps.list().find(r => r.manifest.id === caller.appId)?.manifest.name ?? caller.appId
      return captureDialog.open(dialogRequest(input), {
        wc: event.sender,
        tabId: caller.instanceId,
        appId: caller.appId,
        appName,
      })
    })
    shellHandle('captureDialog:close', (event) => {
      const caller = callerOf(event.sender.id)
      captureDialog.cancelByCaller({ appId: caller.appId, tabId: caller.instanceId })
    })
    shellHandle('captureDialog:startPreview', (event, deviceId: string, resolutionNum?: number) =>
      captureDialog.startPreview(event.sender, String(deviceId ?? ''), typeof resolutionNum === 'number' ? { resolutionNum } : undefined))
    shellHandle('captureDialog:stopPreview', event => captureDialog.stopPreview(event.sender))
    shellHandle('captureDialog:snap', (event, opts?: { dataUrl?: string, meta?: Record<string, unknown> }) =>
      captureDialog.capture(event.sender, opts))
    shellHandle('captureDialog:confirm', (event, results: unknown) =>
      captureDialog.confirm(event.sender, confirmResults(results)))
  }

  // 设备配置中心：各能力参数读写与演示模式切换，均为平台管理动作。
  // 诊断台是验机形态的 embedded 应用（appId 非 shell），故按「平台自身 + 验机形态」放行，第三方应用一律拒绝。
  function assertDeviceConfigCaller(senderId: number): void {
    const appId = callerOf(senderId).appId
    if (appId !== SHELL_APP_ID && !flavor.diagnostics) {
      throw new Error('仅平台工作台可修改设备配置')
    }
  }
  shellHandle('deviceConfig:snapshot', (e, capabilityId?: string) => {
    assertDeviceConfigCaller(e.sender.id)
    return devices.configCenter.snapshot(capabilityId)
  })
  shellHandle('deviceConfig:apply', async (e, capabilityId: string, deviceProfileId: string, patch: Record<string, unknown>) => {
    assertDeviceConfigCaller(e.sender.id)
    await devices.applyConfig(capabilityId, deviceProfileId, patch ?? {})
    return devices.configCenter.snapshot(capabilityId)
  })
  shellHandle('deviceConfig:reset', async (e, capabilityId?: string) => {
    assertDeviceConfigCaller(e.sender.id)
    await devices.resetConfig(capabilityId)
    return devices.configCenter.snapshot()
  })
  shellHandle('deviceConfig:demoMode', (e) => {
    assertDeviceConfigCaller(e.sender.id)
    return devices.isDemoMode()
  })
  shellHandle('deviceConfig:setDemoMode', (e, enabled: boolean) => {
    assertDeviceConfigCaller(e.sender.id)
    devices.setDemoMode(Boolean(enabled))
    return devices.isDemoMode()
  })

  // 验机文件选择：渲染层只拿到用户显式选中的绝对路径，不开放任意路径读写。
  // 扩展名白名单由主进程固定，渲染层传入的 kind 仅作为过滤器，不参与放行判定。
  shellHandle('diagnostics:pickFile', async (e, kind?: string) => {
    assertDeviceConfigCaller(e.sender.id)
    const resolved = kind === 'image' ? 'image' : kind === 'pdf' ? 'pdf' : 'any'
    const filters: Electron.FileFilter[] = resolved === 'image'
      ? [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'] }]
      : resolved === 'pdf'
        ? [{ name: 'PDF 文档', extensions: ['pdf'] }]
        : [{ name: '图片与 PDF', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'] }]
    const result = await dialog.showOpenDialog({
      title: '选择验机文件',
      properties: ['openFile'],
      filters,
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  // 设置通道（schema 驱动）
  registerSettingsIpc(ipcMain)

  // 启动打点（T4 首帧）：send 通道经 shellOn 契约注册
  shellOn('system:markFirstPaint', () => {
    kernel.ctx.marks.t4FirstPaint = Date.now()
    const m = kernel.ctx.marks
    // 启动全链路打点汇总（一次启动一行，观测启动回归）
    logger.info('launch marks', {
      t0_process: m.t0ProcessStart,
      t1_kernel: m.t1KernelReady,
      t2_deviceHost: m.t2DeviceHostReady,
      t3_window: m.t3WindowShown,
      t4_firstPaint: m.t4FirstPaint,
    })
  })
}
