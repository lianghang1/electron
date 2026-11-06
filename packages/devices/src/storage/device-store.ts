import { createStore } from './store'

/**
 * 设备域配置持久化统一入口（userData/storage/device-<name>.json）。
 *
 * 约定（多设备域接入配置化时复用本入口，勿直接持有 electron-store）：
 * - 单设备域：配置为根对象（如 scanner），支持 defaults 出厂兜底；
 * - 多设备域：electron-store 根必须为对象，数组不能直接落盘，用 { devices: [...] } 包一层；
 *   多厂商域需要「缺省定位」时根对象再加 defaultDeviceId?: string（capture 先例）——
 *   业务调用 deviceId 缺省时主进程按「默认设备且就绪优先 → 第一个就绪设备」自动定位，
 *   渲染层与 IPC 契约无需感知设备 id。
 *
 * 设备服务只负责配置编辑（patch 合并 / 按 id 整条 upsert）与热重建，落盘由本入口承担。
 */
export interface DeviceConfigStore<T extends Record<string, any>> {
  /** 读全量（首次启动无历史数据时返回 defaults，未传 defaults 则字段为 undefined） */
  load: () => T
  /** 整体写回（electron-store 原子落盘） */
  save: (value: T) => void
}

export function createDeviceStore<T extends Record<string, any>>(
  name: string,
  defaults?: T,
): DeviceConfigStore<T> {
  const store = createStore<T>({
    name: `device-${name}`,
    ...(defaults !== undefined ? { defaults } : {}),
  })
  return {
    load: () => store.store,
    save: (value) => { store.store = value },
  }
}
