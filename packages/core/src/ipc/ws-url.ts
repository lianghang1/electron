/**
 * IPC 入参的 ws 服务地址校验（scanner HID / idcard ws / signature ws 共用规则）：
 * 仅接受 ws:// 或 wss:// 前缀的绝对地址，其余值一律丢弃不落盘。
 * 规则实现收口在 shared（与渲染层面板校验同源），此处仅按主进程既有导入路径再出口。
 */
export { isWsUrl } from '@desktop/shared'
