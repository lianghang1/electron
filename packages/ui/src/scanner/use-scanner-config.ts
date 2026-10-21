import type { ScannerConfig, ScannerDeviceConfig, ScannerDeviceOverrides, ScannerSetInput } from '@desktop/shared'
import { isWsUrl } from '@desktop/shared'
import { computed, reactive, ref } from 'vue'

/**
 * 扫码枪设置面板视图状态（reactive 扁平化，状态归系统设置弹窗持有，面板只做展示与动作转发）。
 * 档案制：域配置 = 总开关 + 激活档案 + 档案列表（清单由代码出厂预设锁死）；面板编辑「选中档案」
 * 的白名单字段 + 总开关 + 激活指向，保存为一次提交（域级状态 + 单档案覆盖）。未保存改动关闭即丢弃。
 */
export interface ScannerConfigView {
  /** 总开关：关闭后扫码枪等同普通键盘 */
  enabled: boolean
  /** 当前生效档案 id（决定接入通道与节奏参数） */
  activeId: string
  /** 档案列表（出厂预设 + 现场覆盖合并后的全量档案，只读清单） */
  devices: ScannerDeviceConfig[]
  /** 面板当前编辑的档案 id */
  selectedId: string
  selected: ScannerDeviceConfig | undefined
  /** 总开关/激活指向/选中档案与最近一次保存值存在差异（未保存黄条依据） */
  dirty: boolean
  loading: boolean
  saving: boolean
  /** 保存成功提示（短暂展示后清除） */
  message: string
  error: string
  load: () => Promise<void>
  select: (id: string) => void
  /** 切换当前生效档案（编辑态，随保存提交） */
  setActive: (id: string) => void
  /** 切换总开关（编辑态，随保存提交） */
  setEnabled: (value: boolean) => void
  save: () => Promise<void>
}

export function useScannerConfig(): ScannerConfigView {
  const enabled = ref(true)
  const activeId = ref('')
  const devices = ref<ScannerDeviceConfig[]>([])
  const selectedId = ref('')
  const loading = ref(false)
  const saving = ref(false)
  const message = ref('')
  const error = ref('')
  let messageTimer: ReturnType<typeof setTimeout> | null = null

  const selected = computed(() => devices.value.find(d => d.id === selectedId.value))

  /** 最近一次保存值快照（全量 JSON，dirty 判定基准） */
  const savedSnapshot = ref('')

  const dirty = computed(() => savedSnapshot.value !== JSON.stringify(currentConfig()))

  /** 当前编辑态组装成的域配置快照（dirty 判定基准，保存时仅提交白名单覆盖） */
  function currentConfig(): ScannerConfig {
    return { enabled: enabled.value, activeId: activeId.value, devices: devices.value.map(cloneDevice) }
  }

  /** 载入域配置，编辑选中回落激活档案 */
  async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const config = await window.desktop.scanner.getConfig()
      enabled.value = config.enabled
      activeId.value = config.activeId
      devices.value = config.devices.map(cloneDevice)
      savedSnapshot.value = JSON.stringify(currentConfig())
      if (!devices.value.some(d => d.id === selectedId.value)) {
        selectedId.value = config.activeId
      }
      if (!devices.value.some(d => d.id === selectedId.value)) {
        selectedId.value = devices.value[0]?.id ?? ''
      }
    }
    catch (err) {
      error.value = describeError(err, '配置载入失败')
    }
    finally {
      loading.value = false
    }
  }

  function select(id: string): void {
    selectedId.value = id
    error.value = ''
  }

  function setActive(id: string): void {
    activeId.value = id
  }

  function setEnabled(value: boolean): void {
    enabled.value = value
  }

  async function save(): Promise<void> {
    const device = selected.value
    if (!device) { return }
    const problem = validate(device)
    if (problem) {
      error.value = problem
      return
    }
    saving.value = true
    error.value = ''
    try {
      const input: ScannerSetInput = {
        enabled: enabled.value,
        activeId: activeId.value,
        deviceId: device.id,
        overrides: overridesOf(device),
      }
      const saved = await window.desktop.scanner.setConfig(input)
      enabled.value = saved.enabled
      activeId.value = saved.activeId
      devices.value = saved.devices.map(cloneDevice)
      savedSnapshot.value = JSON.stringify(currentConfig())
      if (!devices.value.some(d => d.id === selectedId.value)) {
        selectedId.value = devices.value[0]?.id ?? ''
      }
      showMessage('已保存')
    }
    catch (err) {
      error.value = describeError(err, '保存失败')
    }
    finally {
      saving.value = false
    }
  }

  function showMessage(text: string): void {
    message.value = text
    if (messageTimer) { clearTimeout(messageTimer) }
    messageTimer = setTimeout(() => {
      message.value = ''
      messageTimer = null
    }, 2500)
  }

  return reactive({
    enabled,
    activeId,
    devices,
    selectedId,
    selected,
    dirty,
    loading,
    saving,
    message,
    error,
    load,
    select,
    setActive,
    setEnabled,
    save,
  })
}

const CHANNEL_LABEL = { keyboard: '键盘仿真', hid: 'HID 通道' } as const

/** 下拉选项文案（面板用）：名称 + 通道 */
export function deviceLabel(device: ScannerDeviceConfig): string {
  return `${device.displayName || '（未命名设备）'} · ${CHANNEL_LABEL[device.transport]}`
}

/** 档案 → 现场白名单覆盖（名称/节奏参数/HID 地址；品牌与通道由代码出厂预设锁死） */
function overridesOf(device: ScannerDeviceConfig): ScannerDeviceOverrides {
  return {
    displayName: device.displayName,
    timeout: device.timeout,
    minLength: device.minLength,
    endKey: device.endKey,
    prefixes: [...device.prefixes],
    requirePrefix: device.requirePrefix,
    ...(device.transport === 'hid' && device.hidUrl ? { hidUrl: device.hidUrl } : {}),
  }
}

/** 保存前校验：与主进程 sanitize 同规则（必填缺失直接提示，不发无效请求） */
function validate(device: ScannerDeviceConfig): string | null {
  if (!device.displayName.trim()) { return '设备名称不能为空' }
  if (device.transport === 'hid' && !(device.hidUrl && isWsUrl(device.hidUrl))) { return 'HID 服务地址不合法（须 ws:// 或 wss:// 前缀）' }
  if (!(device.timeout > 0)) { return '字符间隔上限须大于 0' }
  if (!(device.minLength >= 0)) { return '最小码长不能为负' }
  if (!device.endKey.trim()) { return '结束键不能为空' }
  return null
}

/** IPC 走 structured clone：必须传纯对象快照，Vue 响应式 Proxy 无法克隆 */
function cloneDevice(device: ScannerDeviceConfig): ScannerDeviceConfig {
  return { ...device, prefixes: [...device.prefixes] }
}

function describeError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : String(err)
  return `${fallback}：${message || '未知错误'}`
}
