export { bootstrap } from './application/bootstrap'
/** App 自有业务通道注册原语：channel 受契约约束，kiosk/hospital 等单应用形态用 */
export { handle } from './ipc/handle'
export type { BootstrapOptions, WindowOverrides } from './types'
