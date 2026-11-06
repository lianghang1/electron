/**
 * 设备传输基座统一契约（kernel/channel）。
 *
 * 三种通道形态对应三类对接方式：ws（厂商本地 WebSocket 服务）、http（厂商本地 HTTP 服务）、
 * native（厂商 C 接口 DLL，经守护进程 utilityProcess 执行）。
 * 基座只收口真正的共性（探活、连接生命周期、幂等收尾、超时清理）；
 * 会话语义（请求配对/事件流）因协议形态差异大，由各通道按自身形态提供：
 *   ws    → withWsSession 短连接会话模板 + connectWs 常驻连接
 *   http  → probeHttp / httpRequest
 *   native → DeviceHost.request（requestId 配对 + 崩溃退避自愈）
 */

export type ChannelKind = 'ws' | 'http' | 'native'

export interface Channel {
  readonly kind: ChannelKind
  /** 轻量探活：不建立完整会话（ws=tcp 探测、http=GET、native=依赖与 DLL 就位） */
  probe: () => Promise<boolean>
  /** 释放通道持有的资源（连接、子进程等） */
  dispose: () => void
}
