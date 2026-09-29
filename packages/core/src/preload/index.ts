import type { DesktopApi, DesktopIpc } from '@desktop/shared'
import type { IpcRendererEvent } from 'electron'
import { contextBridge, ipcRenderer } from 'electron'

// channel 常量表（平台 invoke 通道）：字符串拼写受 DesktopIpc 契约约束，写错直接编译报错
const channels = {
  minimize: 'window:minimize',
  maximize: 'window:maximize',
  restore: 'window:restore',
  isMaximized: 'window:isMaximized',
  close: 'window:close',
  appList: 'app:list',
  appGetManifest: 'app:getManifest',
  appGetCurrent: 'app:getCurrent',
  tabsList: 'tabs:list',
  tabsOpen: 'tabs:open',
  tabsClose: 'tabs:close',
  tabsActivate: 'tabs:activate',
  tabsReload: 'tabs:reload',
  tabsSetWorkArea: 'tabs:setWorkArea',
  permissionCheck: 'permission:check',
  permissionRespond: 'permission:respond',
  permissionList: 'permission:list',
  permissionReset: 'permission:reset',
  storageGet: 'storage:get',
  storageSet: 'storage:set',
  storageRemove: 'storage:remove',
  storageClear: 'storage:clear',
  cacheClear: 'cache:clear',
  cacheClearSite: 'cache:clearSite',
  overlayShowMenu: 'overlay:showMenu',
  overlayHideMenu: 'overlay:hideMenu',
  overlayAction: 'overlay:action',
  overlayResize: 'overlay:resize',
  overlaySync: 'overlay:sync',
  updateCheck: 'update:check',
  updateInstall: 'update:install',
  deviceIdcardRead: 'device:idcard:read',
  devicePrinterPrint: 'device:printer:print',
  notificationShow: 'notification:show',
} as const satisfies Record<string, keyof DesktopIpc>

/** 平台 invoke 通道白名单（$invoke 之外的强类型方法不受此表约束） */
const PLATFORM_CHANNELS = new Set<string>(Object.values(channels))

export interface DesktopBridgeOptions {
  /**
   * App 业务通道白名单（app 本地契约，如 'crm:query'）。
   * 与 Main 侧 createHandle<AppIpc>() 注册的通道保持一致；
   * 白名单外的 channel 在 $invoke 处直接拒绝，保持最小桥。
   */
  appChannels?: readonly string[]
}

/**
 * 暴露 window.desktop 平台桥：只暴露 DesktopApi 声明的方法，不暴露裸 ipcRenderer。
 * 身份不经过参数：Main 侧按 event.sender 反查 CallerContext。
 * 无业务通道的 App 直接 exposeDesktop()；有业务通道的 App 声明白名单。
 */
export function exposeDesktop(options: DesktopBridgeOptions = {}): void {
  const allowedChannels = new Set<string>([
    ...PLATFORM_CHANNELS,
    ...(options.appChannels ?? []),
  ])

  const desktop: DesktopApi = {
    window: {
      minimize: () => ipcRenderer.invoke(channels.minimize),
      maximize: () => ipcRenderer.invoke(channels.maximize),
      restore: () => ipcRenderer.invoke(channels.restore),
      close: () => ipcRenderer.invoke(channels.close),
      isMaximized: () => ipcRenderer.invoke(channels.isMaximized),
    },
    app: {
      list: () => ipcRenderer.invoke(channels.appList),
      getManifest: appId => ipcRenderer.invoke(channels.appGetManifest, appId),
      getCurrent: () => ipcRenderer.invoke(channels.appGetCurrent),
    },
    tabs: {
      list: () => ipcRenderer.invoke(channels.tabsList),
      open: opts => ipcRenderer.invoke(channels.tabsOpen, opts),
      close: tabId => ipcRenderer.invoke(channels.tabsClose, tabId),
      activate: tabId => ipcRenderer.invoke(channels.tabsActivate, tabId),
      reload: tabId => ipcRenderer.invoke(channels.tabsReload, tabId),
      setWorkArea: rect => ipcRenderer.invoke(channels.tabsSetWorkArea, rect),
    },
    permission: {
      check: permission => ipcRenderer.invoke(channels.permissionCheck, permission),
      respond: (requestId, granted) => ipcRenderer.invoke(channels.permissionRespond, requestId, granted),
      list: appId => ipcRenderer.invoke(channels.permissionList, appId),
      reset: appId => ipcRenderer.invoke(channels.permissionReset, appId),
    },
    storage: {
      get: key => ipcRenderer.invoke(channels.storageGet, key),
      set: (key, value) => ipcRenderer.invoke(channels.storageSet, key, value),
      remove: key => ipcRenderer.invoke(channels.storageRemove, key),
      clear: () => ipcRenderer.invoke(channels.storageClear),
    },
    cache: {
      clear: appId => ipcRenderer.invoke(channels.cacheClear, appId),
      clearSite: appId => ipcRenderer.invoke(channels.cacheClearSite, appId),
    },
    overlay: {
      showMenu: config => ipcRenderer.invoke(channels.overlayShowMenu, config),
      hideMenu: () => ipcRenderer.invoke(channels.overlayHideMenu),
      action: itemId => ipcRenderer.invoke(channels.overlayAction, itemId),
      resize: height => ipcRenderer.invoke(channels.overlayResize, height),
      sync: () => ipcRenderer.invoke(channels.overlaySync),
    },
    update: {
      check: () => ipcRenderer.invoke(channels.updateCheck),
      install: () => ipcRenderer.invoke(channels.updateInstall),
    },
    device: {
      readIdCard: () => ipcRenderer.invoke(channels.deviceIdcardRead),
      print: ticket => ipcRenderer.invoke(channels.devicePrinterPrint, ticket),
    },
    notification: {
      show: notification => ipcRenderer.invoke(channels.notificationShow, notification),
    },
    $invoke: (channel, ...args) => {
      if (!allowedChannels.has(channel))
        throw new Error(`ipc channel not exposed: ${channel}`)
      return ipcRenderer.invoke(channel, ...args)
    },
    events: {
      on: (channel, listener) => {
        // 推送事件的监听包装：剥掉 Electron event 首参，只透传契约负载数据
        const wrapped = (_event: IpcRendererEvent, ...args: unknown[]) =>
          (listener as (...args: unknown[]) => void)(...args)
        ipcRenderer.on(channel, wrapped)
        return () => ipcRenderer.removeListener(channel, wrapped)
      },
    },
  }

  try {
    contextBridge.exposeInMainWorld('desktop', desktop)
  }
  catch (error) {
    console.error(error)
  }
}
