import { execFile } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'
import { parseWsUrl, tcpProbe } from '../../../kernel/channel/ws-channel'

const execFileAsync = promisify(execFile)

/**
 * 唤醒上下文：锚点 = 档案 ws 地址 + 品牌标识（发现式匹配的唯一依据）。
 * 不内置任何厂商任务名/服务名常量——厂商换名、换软件名时仅需调整档案 brand 或配置 wake.command。
 */
export interface CamSdkWakeContext {
  url: string
  brand: string
  /** 现场覆盖命令（如 schtasks /run /tn <厂商任务名>）：按平台 shell 解释，最高优先级 */
  command?: string
}

/** sc query STATE 字段的判定值（其余非运行态统一按已停止处理） */
const SERVICE_STATE = { STOPPED: 1, RUNNING: 4 } as const

/** sc qc START_TYPE 字段的判定值 */
const SERVICE_START_TYPE = { AUTO_START: 2, DEMAND_START: 3, DISABLED: 4 } as const

/** 拉起动作成功后等待 ws 端口就绪的单次时限（厂商服务端初始化 SDK 需要数秒） */
const PORT_READY_TIMEOUT_MS = 10000

/** 自动拉起节流间隔：避免设备列表频繁刷新时反复执行发现与拉起 */
const START_RETRY_INTERVAL_MS = 15000

/** 单类通道的最大尝试数（品牌命中通常极少，防御性上限） */
const MAX_WAKE_CANDIDATES = 3

/** 空发现结果的缓存时限：厂商后装场景 1 分钟内自动重发现，同时避免离线刷新期反复全量检索 */
const EMPTY_CACHE_TTL_MS = 60000

/** 节流时间戳（进程级共享，跨 listDevices/previewOp 生效） */
let lastStartAttemptAt = 0

/** 发现结果缓存：brand → 命中名（非空常驻；空结果按 EMPTY_CACHE_TTL_MS 过期） */
const discoveryCache = new Map<string, { names: string[], at: number }>()

/** 子进程失败时 err 上挂的退出码与标准输出（1060=服务未注册、1056=服务已启动） */
interface ProcFailure {
  code?: number | string
  stdout?: string
}

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

/** 正则元字符转义（brand 为用户可编辑文本，拼 RegExp 前必须转义） */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 发现结果统一缓存：非空常驻，空结果短 TTL（厂商后装后自动重发现） */
async function discoverCached(key: string, search: () => Promise<string[]>): Promise<string[]> {
  const hit = discoveryCache.get(key)
  if (hit && (hit.names.length > 0 || Date.now() - hit.at < EMPTY_CACHE_TTL_MS)) {
    return hit.names
  }
  const names = await search()
  discoveryCache.set(key, { names, at: Date.now() })
  return names
}

/** schtasks CSV 行拆分（字段可含引号包裹的逗号；手写小解析避免引入 CSV 依赖） */
function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        }
        else {
          inQuotes = false
        }
      }
      else {
        current += ch
      }
    }
    else if (ch === '"') {
      inQuotes = true
    }
    else if (ch === ',') {
      cells.push(current)
      current = ''
    }
    else {
      current += ch
    }
  }
  cells.push(current)
  return cells
}

/**
 * 按品牌检索厂商计划任务（schtasks 全量枚举，任务名/动作行含品牌即候选；TaskName 恒为第 2 列）。
 * 已知局限：中文 Windows 的 schtasks 输出为 GBK，中文任务名会乱码——ASCII 品牌名不受影响，
 * 全中文命名场景请用档案 wake.command 覆盖。
 */
function discoverVendorTasks(brand: string): Promise<string[]> {
  return discoverCached(`task:${brand}`, async () => {
    const { stdout } = await execFileAsync('schtasks.exe', ['/query', '/fo', 'csv', '/v', '/nh'], {
      timeout: 20000,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    })
    const pattern = new RegExp(escapeRegExp(brand), 'i')
    const names: string[] = []
    for (const line of stdout.split(/\r?\n/)) {
      if (!pattern.test(line)) {
        continue
      }
      const name = splitCsvLine(line)[1]?.trim()
      if (name && !names.includes(name)) {
        names.push(name)
        if (names.length >= MAX_WAKE_CANDIDATES) {
          break
        }
      }
    }
    return names
  })
}

/** Windows 服务注册表根键（读取无需管理员；服务键名 = 服务名） */
const SERVICES_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Services'

/** 校验服务 ImagePath 含品牌（读取失败视为不匹配，宁缺勿误启无关服务） */
async function imagePathMatches(name: string, pattern: RegExp): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('reg.exe', ['query', `${SERVICES_KEY}\\${name}`, '/v', 'ImagePath'], {
      timeout: 5000,
      windowsHide: true,
    })
    return pattern.test(stdout)
  }
  catch {
    return false
  }
}

/**
 * 按品牌检索厂商 Windows 服务：注册表服务键名匹配，再校验 ImagePath 同样含品牌。
 * 服务键存在子键（Parameters 等），仅取 Services 直下的一级键。
 */
function discoverVendorServices(brand: string): Promise<string[]> {
  return discoverCached(`service:${brand}`, async () => {
    const { stdout } = await execFileAsync('reg.exe', ['query', SERVICES_KEY, '/f', brand, '/k', '/s'], {
      timeout: 15000,
      windowsHide: true,
    })
    const pattern = new RegExp(escapeRegExp(brand), 'i')
    const names: string[] = []
    for (const line of stdout.split(/\r?\n/)) {
      const regPath = line.trim()
      const marker = '\\Services\\'
      const at = regPath.indexOf(marker)
      if (!regPath.startsWith('HKEY_') || at < 0) {
        continue
      }
      const name = regPath.slice(at + marker.length)
      if (name.includes('\\') || !pattern.test(name) || names.includes(name)) {
        continue
      }
      if (!await imagePathMatches(name, pattern)) {
        continue
      }
      names.push(name)
      if (names.length >= MAX_WAKE_CANDIDATES) {
        break
      }
    }
    return names
  })
}

/**
 * 按品牌检索厂商 systemd 服务单元（Linux/信创）。user 单元可直接启；system 单元是否放权
 * 取决于发行版 polkit 配置。首版未经信创实测，失败静默降级。
 */
function discoverVendorUnits(brand: string): Promise<string[]> {
  return discoverCached(`unit:${brand}`, async () => {
    const { stdout } = await execFileAsync('systemctl', ['list-unit-files', '--type=service', '--no-legend'], { timeout: 10000 })
    const pattern = new RegExp(escapeRegExp(brand), 'i')
    return stdout
      .split(/\r?\n/)
      .map(line => line.trim().split(/\s+/)[0] ?? '')
      .filter(unit => unit && pattern.test(unit))
      .slice(0, MAX_WAKE_CANDIDATES)
  })
}

/** 执行现场覆盖命令（命令来自本机档案配置，信任级别等同用户自行开终端执行） */
async function runWakeCommand(command: string): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      await execFileAsync('cmd.exe', ['/d', '/s', '/c', command], { timeout: 15000, windowsHide: true })
    }
    else {
      await execFileAsync('sh', ['-c', command], { timeout: 15000 })
    }
    return true
  }
  catch {
    return false
  }
}

/** schtasks /run 触发厂商任务（任务以登录用户身份运行，无需管理员） */
async function runSchtasks(name: string): Promise<boolean> {
  try {
    await execFileAsync('schtasks.exe', ['/run', '/tn', name], { timeout: 10000, windowsHide: true })
    return true
  }
  catch {
    return false
  }
}

/** 执行 sc 子命令；1060（服务未注册）返回空串，其余非零退出码抛给调用方 */
async function runSc(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('sc.exe', args, { timeout: 5000, windowsHide: true })
    return stdout
  }
  catch (err) {
    const failure = err as ProcFailure
    if (failure.code === 1060) {
      return String(failure.stdout ?? '')
    }
    throw err
  }
}

/** sc start 拉起指定服务（1056=已在运行视为成功；厂商未放权时返回 false） */
async function startService(name: string): Promise<boolean> {
  try {
    await execFileAsync('sc.exe', ['start', name], { timeout: 5000, windowsHide: true })
    return true
  }
  catch (err) {
    return (err as ProcFailure).code === 1056
  }
}

/** 执行单个候选通道（task: 前缀 = 计划任务；service: 前缀 = Windows 服务；其余 = systemd 单元名） */
async function wakeOne(candidate: string): Promise<boolean> {
  if (candidate.startsWith('task:')) {
    return runSchtasks(candidate.slice('task:'.length))
  }
  if (candidate.startsWith('service:')) {
    return startService(candidate.slice('service:'.length))
  }
  try {
    await execFileAsync('systemctl', ['start', candidate], { timeout: 15000 })
    return true
  }
  catch {
    return false
  }
}

/**
 * 厂商服务端自动拉起（发现式，零硬编码命名）：探活失败后按序尝试
 * ①现场覆盖命令 ②Windows 计划任务发现（schtasks /run，用户态已验证可行）→ Windows 服务发现
 * （sc start，厂商放权时可用）；Linux 走 systemd 单元发现。任一通道触发后端口就绪即成功。
 * 返回 false = 不可拉起（未安装/失败/超时），调用方走诊断提示。
 * 15s 进程级节流防设备列表频繁刷新时重复拉起。
 */
export async function ensureCamSdkService(ctx: CamSdkWakeContext): Promise<boolean> {
  if ((process.platform !== 'win32' && process.platform !== 'linux') || Date.now() - lastStartAttemptAt < START_RETRY_INTERVAL_MS) {
    return false
  }
  lastStartAttemptAt = Date.now()
  try {
    if (ctx.command && await runWakeCommand(ctx.command)) {
      return await waitForWsPort(ctx.url, PORT_READY_TIMEOUT_MS)
    }
    // 空 brand 的正则会匹配一切（误拉无关任务/服务），无覆盖命令时直接放弃发现
    const brand = ctx.brand.trim()
    if (!brand) {
      return false
    }
    const candidates = process.platform === 'win32'
      ? [...await discoverVendorTasks(brand), ...await discoverVendorServices(brand)]
      : await discoverVendorUnits(brand)
    for (const candidate of candidates) {
      if (await wakeOne(candidate)) {
        return await waitForWsPort(ctx.url, PORT_READY_TIMEOUT_MS)
      }
    }
    return false
  }
  catch {
    // 自愈是尽力而为的增强：任何异常（地址解析、进程异常）都不得外溢影响设备列表/拍照主流程
    return false
  }
}

/**
 * 厂商服务诊断（发现式命名）：探活失败时区分「未安装 / 被禁 / 未运行 / 运行中但端口不通」。
 * 文案基于 brand 的动态发现结果生成，发现不到时给出通用指引（含 wake.command 配置建议）。
 * 仅 Windows 有完整四态；非 Windows 或诊断失败返回 null，调用方维持原始提示（诊断不掩盖探活事实）。
 */
export async function diagnoseCamSdkService(ctx: CamSdkWakeContext): Promise<string | null> {
  if (process.platform !== 'win32') {
    return null
  }
  // 空 brand 无法发现式匹配，直接给出档案配置指引而非全量误匹配
  const brand = ctx.brand.trim()
  if (!brand) {
    return '设备档案未填写品牌，无法自动发现厂商服务（填写品牌或配置拉起命令后重试）'
  }
  try {
    const services = await discoverVendorServices(brand)
    if (services.length === 0) {
      const tasks = await discoverVendorTasks(brand)
      if (tasks.length > 0) {
        return `检测到 ${brand} 计划任务（${tasks.join('、')}）但服务端口不通（确认任务拉起的服务端正常监听）`
      }
      return `未检测到 ${brand} 相关服务或计划任务（确认厂商服务端已安装；或在设备档案配置拉起命令）`
    }
    const name = services[0] ?? ''
    const state = parseScQueryState(await runSc(['query', name]))
    if (state === 'running') {
      return `${name} 服务运行中但 ${ctx.url} 端口不通（检查防火墙或端口占用）`
    }
    if (state === 'stopped') {
      const startType = parseScQcStartType(await runSc(['qc', name]))
      if (startType === 'disabled') {
        return `${name} 服务已安装但被禁用（services.msc 恢复为自动并启动）`
      }
      return `${name} 服务已安装但未运行（刷新设备列表会尝试自动拉起；若反复失败请联系装机人员）`
    }
    return null
  }
  catch {
    // 诊断不可用只降级为原始离线提示，异常不外溢影响设备列表/拍照主流程
    return null
  }
}
