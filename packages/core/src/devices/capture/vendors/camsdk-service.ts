import { execFile } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'
import { parseWsUrl, tcpProbe } from '../../kernel/channel/ws-channel'

const execFileAsync = promisify(execFile)

/** CamSDKServer 的 Windows 服务注册名（SDK 安装包固定，非进程名） */
export const CAMSDK_SERVICE_NAME = 'CamSDKServer'

/** sc query STATE 字段的判定值（其余非运行态统一按已停止处理） */
const SERVICE_STATE = { STOPPED: 1, RUNNING: 4 } as const

/** sc qc START_TYPE 字段的判定值 */
const SERVICE_START_TYPE = { AUTO_START: 2, DEMAND_START: 3, DISABLED: 4 } as const

/** 服务启动后等待 ws 端口就绪的总时限（服务初始化 SDK 需要数秒） */
const PORT_READY_TIMEOUT_MS = 10000

/** 自动拉起节流间隔：避免设备列表频繁刷新时反复执行 sc start */
const START_RETRY_INTERVAL_MS = 15000

/** 节流时间戳（进程级共享，跨 listDevices/previewOp 生效） */
let lastStartAttemptAt = 0

/** sc 子命令失败时 err 上挂的退出码与标准输出（1060=服务未注册、1056=服务已启动、5=拒绝访问） */
interface ScFailure {
  code?: number | string
  stdout?: string
}

export type CamSdkServiceState = 'running' | 'stopped' | 'missing' | null

export type CamSdkStartType = 'auto' | 'demand' | 'disabled' | null

/** 解析 sc query 输出的 STATE 行（形如 `STATE : 4 RUNNING`；异常输出返回 null） */
export function parseScQueryState(output: string): 'running' | 'stopped' | 'paused' | null {
  const matched = /STATE\s*:\s*(\d+)/.exec(output)
  if (!matched) {
    return null
  }
  const code = Number(matched[1])
  if (code === SERVICE_STATE.RUNNING) {
    return 'running'
  }
  if (code === SERVICE_STATE.STOPPED) {
    return 'stopped'
  }
  return code >= 5 ? 'paused' : null
}

/** 解析 sc qc 输出的 START_TYPE 行（2=自动 3=手动 4=禁用；异常输出返回 null） */
export function parseScQcStartType(output: string): CamSdkStartType {
  const matched = /START_TYPE\s*:\s*(\d+)\s+\S+/.exec(output)
  if (!matched) {
    return null
  }
  const code = Number(matched[1])
  if (code === SERVICE_START_TYPE.AUTO_START) {
    return 'auto'
  }
  if (code === SERVICE_START_TYPE.DEMAND_START) {
    return 'demand'
  }
  if (code === SERVICE_START_TYPE.DISABLED) {
    return 'disabled'
  }
  return null
}

/** 执行 sc 子命令；非零退出码时把退出码与 stdout 抛给调用方判定（1060=服务不存在） */
async function runSc(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('sc.exe', args, { timeout: 5000 })
    return stdout
  }
  catch (err) {
    const failure = err as ScFailure
    if (failure.code === 1060) {
      return String(failure.stdout ?? '')
    }
    throw err
  }
}

/**
 * 查询服务注册与运行状态：running=运行中；stopped=已注册未运行（含暂停）；
 * missing=未注册（1060，SDK 未安装）；null=sc 不可用（非 Windows/权限异常，诊断降级）。
 */
async function resolveServiceState(): Promise<CamSdkServiceState> {
  try {
    const state = parseScQueryState(await runSc(['query', CAMSDK_SERVICE_NAME]))
    if (state === 'running') {
      return 'running'
    }
    return state === null ? 'missing' : 'stopped'
  }
  catch {
    return null
  }
}

/** 读取服务启动类型；读取失败返回 null（诊断降级为不提及自启配置） */
async function resolveStartType(): Promise<CamSdkStartType> {
  try {
    return parseScQcStartType(await runSc(['qc', CAMSDK_SERVICE_NAME]))
  }
  catch {
    return null
  }
}

/** sc start 拉起服务（1056=已在运行视为成功；权限不足等失败返回 false，由调用方走诊断提示） */
async function startCamSdkService(): Promise<boolean> {
  try {
    await execFileAsync('sc.exe', ['start', CAMSDK_SERVICE_NAME], { timeout: 5000 })
    return true
  }
  catch (err) {
    return (err as ScFailure).code === 1056
  }
}

/** 轮询探活等待服务端口就绪（就绪即返回，超时返回 false） */
export async function waitForWsPort(url: string, timeoutMs: number, intervalMs = 500): Promise<boolean> {
  const { host, port } = parseWsUrl(url)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await tcpProbe(host, port, 1000)) {
      return true
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  return false
}

/**
 * CamSDKServer 自动拉起：探活失败时若服务已安装且未禁用，sc start 后等待端口就绪。
 * 返回 true = 已自愈（端口可连）；false = 不可拉起（未安装/被禁用/权限不足/超时），调用方走诊断提示。
 * 仅 Windows；15s 进程级节流防设备列表频繁刷新时重复拉起。
 */
export async function ensureCamSdkService(url: string): Promise<boolean> {
  try {
    if (process.platform !== 'win32' || Date.now() - lastStartAttemptAt < START_RETRY_INTERVAL_MS) {
      return false
    }
    const state = await resolveServiceState()
    if (state !== 'stopped' || await resolveStartType() === 'disabled') {
      return false
    }
    lastStartAttemptAt = Date.now()
    if (!await startCamSdkService()) {
      return false
    }
    return waitForWsPort(url, PORT_READY_TIMEOUT_MS)
  }
  catch {
    // 自愈是尽力而为的增强：任何异常（地址解析、sc 异常）都不得外溢影响设备列表/拍照主流程
    return false
  }
}

/**
 * CamSDK 服务四态诊断：探活失败时区分「未注册（未安装）/ 自启被禁 / 未运行 / 运行中但端口不通」。
 * 仅 Windows 有 sc；非 Windows 或诊断本身失败返回 null，调用方维持原始提示（诊断不掩盖探活事实）。
 */
export async function diagnoseCamSdkService(url: string): Promise<string | null> {
  try {
    if (process.platform !== 'win32') {
      return null
    }
    const state = await resolveServiceState()
    if (state === null) {
      return null
    }
    if (state === 'missing') {
      return `${CAMSDK_SERVICE_NAME} 服务未注册（CamSDK 服务端未安装）`
    }
    if (state === 'stopped') {
      const startType = await resolveStartType()
      if (startType === 'disabled') {
        return `${CAMSDK_SERVICE_NAME} 服务已安装但被禁用（services.msc 恢复为自动并启动）`
      }
      if (startType === 'demand') {
        return `${CAMSDK_SERVICE_NAME} 服务已安装但未运行（启动类型为手动，建议设为自动自启）`
      }
      return `${CAMSDK_SERVICE_NAME} 服务已安装但未运行（可执行 net start ${CAMSDK_SERVICE_NAME}）`
    }
    return `${CAMSDK_SERVICE_NAME} 服务运行中但 ${url} 端口不通（检查防火墙或端口占用）`
  }
  catch {
    // 诊断不可用只降级为原始离线提示，异常不外溢影响设备列表/拍照主流程
    return null
  }
}
