import type { IdReaderDevice, ReadResult } from '../types'
import { contextBridge, ipcRenderer } from 'electron'

/** 渲染进程唯一可见的证卡读取接口 */
export interface IdCardApi {
  listReaders: () => Promise<IdReaderDevice[]>
  read: (req: { deviceId: string }) => Promise<ReadResult>
}

/** 宿主 preload 一行接入：exposeIdCardApi() */
export function exposeIdCardApi(): void {
  const api: IdCardApi = {
    listReaders: () => ipcRenderer.invoke('idcard:list'),
    read: req => ipcRenderer.invoke('idcard:read', req),
  }
  contextBridge.exposeInMainWorld('idcardApi', api)
}
