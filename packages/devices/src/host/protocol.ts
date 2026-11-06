/**
 * 设备守护进程协议：主进程 ↔ utilityProcess 的设备无关 RPC 消息。
 * 消息经结构化克隆传输，payload/response 必须可序列化（与 IPC 同约束）。
 */

/** 主进程 → 守护进程请求 */
export interface HostRequest {
  /** 请求序号（主进程侧单调递增），响应用它配对 */
  id: number
  /** 方法名：`<域>.<动作>`（如 idcard.read）；域前缀避免后期多设备域方法撞名 */
  method: string
  payload?: unknown
}

/** 守护进程侧错误（与跨 IPC 错误载荷同构：name/code/message/detail 四元组） */
export interface HostError {
  name: string
  code: string
  message: string
  detail?: unknown
}

/** 守护进程 → 主进程响应：error 与 result 互斥 */
export interface HostResponse {
  id: number
  result?: unknown
  error?: HostError
}
