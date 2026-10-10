import { runDeviceHost } from '@desktop/core/device-host'

// 设备守护进程入口：utilityProcess.fork 的执行模块（out/main/device-host.js）。
// 厂商 DLL 的 koffi 调用全部在该进程内执行，native 崩溃由 DeviceHost 退避重启自愈。
runDeviceHost()
