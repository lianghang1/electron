/** 宿主操作系统事实源：域内不再裸读 process.platform，平台分支只在此处判定。 */
import process from 'node:process'

export type HostOs = 'windows' | 'linux' | 'mac' | 'other'

export function currentHostOs(): HostOs {
  if (process.platform === 'win32') { return 'windows' }
  if (process.platform === 'linux') { return 'linux' }
  if (process.platform === 'darwin') { return 'mac' }
  return 'other'
}

export function isWindowsHost(): boolean {
  return currentHostOs() === 'windows'
}

/** 厂商服务自动拉起仅 Windows（计划任务/服务）与 Linux（systemd 单元）可用。 */
export function supportsServiceAutoStart(): boolean {
  const os = currentHostOs()
  return os === 'windows' || os === 'linux'
}
