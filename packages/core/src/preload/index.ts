import type { DesktopApi, DesktopIpc } from '@desktop/shared'
import type { IpcRendererEvent } from 'electron'
import { contextBridge, ipcRenderer } from 'electron'

// channel 常量表：字符串拼写受 DesktopIpc 契约约束，写错 channel 直接编译报错
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
  storageGet: 'storage:get',
  storageSet: 'storage:set',
  storageRemove: 'storage:remove',
  storageClear: 'storage:clear',
  updateCheck: 'update:check',
  updateInstall: 'update:install',
  deviceIdcardRead: 'device:idcard:read',
  devicePrinterPrint: 'device:printer:print',
  hospitalConfigGet: 'hospital:config:get',
  fhConfigGet: 'fh:config:get',
  fhOrderQuery: 'fh:order:query',
  fhPayCreate: 'fh:pay:create',
  fhPayStatus: 'fh:pay:status',
  fhInvoiceList: 'fh:invoice:list',
  fhInvoiceIssue: 'fh:invoice:issue',
} as const satisfies Record<string, keyof DesktopIpc>

// 最小平台桥：只暴露 DesktopApi 声明的方法，不暴露裸 ipcRenderer。
// 身份不经过参数：Main 侧按 event.sender 反查 CallerContext。
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
    open: options => ipcRenderer.invoke(channels.tabsOpen, options),
    close: tabId => ipcRenderer.invoke(channels.tabsClose, tabId),
    activate: tabId => ipcRenderer.invoke(channels.tabsActivate, tabId),
    reload: tabId => ipcRenderer.invoke(channels.tabsReload, tabId),
    setWorkArea: rect => ipcRenderer.invoke(channels.tabsSetWorkArea, rect),
  },
  permission: {
    check: permission => ipcRenderer.invoke(channels.permissionCheck, permission),
    respond: (requestId, granted) => ipcRenderer.invoke(channels.permissionRespond, requestId, granted),
    list: appId => ipcRenderer.invoke(channels.permissionList, appId),
  },
  storage: {
    get: key => ipcRenderer.invoke(channels.storageGet, key),
    set: (key, value) => ipcRenderer.invoke(channels.storageSet, key, value),
    remove: key => ipcRenderer.invoke(channels.storageRemove, key),
    clear: () => ipcRenderer.invoke(channels.storageClear),
  },
  update: {
    check: () => ipcRenderer.invoke(channels.updateCheck),
    install: () => ipcRenderer.invoke(channels.updateInstall),
  },
  device: {
    readIdCard: () => ipcRenderer.invoke(channels.deviceIdcardRead),
    print: ticket => ipcRenderer.invoke(channels.devicePrinterPrint, ticket),
  },
  hospital: {
    getConfig: () => ipcRenderer.invoke(channels.hospitalConfigGet),
  },
  funeral: {
    getConfig: () => ipcRenderer.invoke(channels.fhConfigGet),
    queryOrders: query => ipcRenderer.invoke(channels.fhOrderQuery, query),
    createPay: orderNo => ipcRenderer.invoke(channels.fhPayCreate, orderNo),
    payStatus: orderNo => ipcRenderer.invoke(channels.fhPayStatus, orderNo),
    listInvoices: query => ipcRenderer.invoke(channels.fhInvoiceList, query),
    issueInvoice: input => ipcRenderer.invoke(channels.fhInvoiceIssue, input),
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
