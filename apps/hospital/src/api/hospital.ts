import type { HospitalIpc } from '../types/ipc'

/**
 * 医院业务 API：window.desktop.$invoke 的类型化收口。
 * channel 拼写受 HospitalIpc 契约约束；白名单在 electron/preload/index.ts 声明。
 */
function invoke<K extends keyof HospitalIpc>(
  channel: K,
  ...args: Parameters<HospitalIpc[K]>
): Promise<Awaited<ReturnType<HospitalIpc[K]>>> {
  return window.desktop.$invoke(channel, ...args) as Promise<Awaited<ReturnType<HospitalIpc[K]>>>
}

export const hospital = {
  /** 业务配置（userData/config.json 覆盖后的合成值） */
  getConfig: () => invoke('hospital:config:get'),
}
