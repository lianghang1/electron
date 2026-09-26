export { bootstrap } from './application/bootstrap'
export type { CardReaderDriver, PrinterDriver } from './device/driver'
/** App 业务契约的通道注册原语：createHandle<AppIpc>() 后注册自有通道（契约放 app 侧，平台包不含业务词汇） */
export { createHandle } from './ipc/handle'
export type { BootstrapOptions, WindowOverrides } from './types'
