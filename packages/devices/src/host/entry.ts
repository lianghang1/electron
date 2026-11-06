import { runDeviceHost } from './run'

// 守护进程入口：utilityProcess fork 的目标 bundle（out/main/device-host.js）。
// 本文件只做一件事——启动消息循环；任何业务逻辑不得进入本文件。
runDeviceHost()
