import type { IccardDeviceOverrides, IcReaderDeviceConfig } from '@desktop/shared'
import type { ConfigDeviceStatus } from '../capture/use-capture-config'
import { isWsUrl } from '@desktop/shared'
import { computed, reactive, ref } from 'vue'
import { useAutoSave } from '../devices/use-auto-save'

/**
 * IC 卡读写设置面板视图状态（reactive 扁平化，状态归系统设置弹窗持有，面板只做展示与动作转发）。
 * 档案制：ws/dll 双路线设备档案列表（清单由代码出厂预设锁死）+ 选中编辑，改动防抖自动保存
 * （切换设备前冲刷待存改动，非法草稿不落库仅提示，关闭弹窗丢弃非法改动）。
 * 设备在线状态经 listReaders 联动（dll 档案经守护进程在位探测）；
 * ws 路线协议适配未接入，对应档案设备不产出（missing）。
 */
export interface IccardConfigView {
  configs: IcReaderDeviceConfig[]
  selectedId: string
  loading: boolean
  saving: boolean
  /** 保存成功提示（短暂展示后清除） */
  message: string
  error: string
  selected: IcReaderDeviceConfig | undefined
  /** 选中档案与最近一次保存值存在差异（自动保存判定基准） */
  dirty: boolean
  /** 选中档案对应的设备状态（设备 id = "<transport>:<档案 id>"） */
  statusOf: (config: IcReaderDeviceConfig) => ConfigDeviceStatus
  load: () => Promise<void>
  select: (id: string) => void
  save: () => Promise<void>
}

export function useIccardConfig(): IccardConfigView {
  const configs = ref<IcReaderDeviceConfig[]>([])
  const selectedId = ref('')
  const loading = ref(false)
  const saving = ref(false)
  const message = ref('')
  const error = ref('')
  let messageTimer: ReturnType<typeof setTimeout> | null = null

  const selected = computed(() => configs.value.find(c => c.id === selectedId.value))

  /** 各档案最近一次保存值快照（dirty 判定基准，按档案 id 存 JSON） */
  const savedSnapshots = ref(new Map<string, string>())

  const dirty = computed(() => {
    const config = selected.value
    if (!config) { return false }
    return savedSnapshots.value.get(config.id) !== JSON.stringify(config)
  })

  /** 改动防抖自动保存（save 为函数声明提升可用；切换设备经 select 冲刷） */
  const autosave = useAutoSave({
    source: selected,
    dirty: () => dirty.value,
    saving: () => saving.value,
    save,
  })

  /** 档案 id → 设备状态（load 时经 listReaders 联动） */
  const deviceStatus = ref(new Map<string, ConfigDeviceStatus>())

  /** 档案对应设备的在线状态 */
  function statusOf(config: IcReaderDeviceConfig): ConfigDeviceStatus {
    const key = `${config.transport}:${config.id}`
    if (!deviceStatus.value.has(key)) { return 'missing' }
    return deviceStatus.value.get(key) ?? 'missing'
  }

  /** 载入档案列表 + 设备在线状态（设备探测失败不阻断编辑） */
  async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      configs.value = await window.desktop.iccard.getConfig()
      savedSnapshots.value = new Map(configs.value.map(c => [c.id, JSON.stringify(c)]))
      try {
        const readers = await window.desktop.iccard.listReaders()
        deviceStatus.value = new Map(readers.map(r => [r.id, r.status]))
      }
      catch {
        deviceStatus.value = new Map()
      }
      if (!configs.value.some(c => c.id === selectedId.value)) {
        selectedId.value = configs.value[0]?.id ?? ''
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
    autosave.flush()
    selectedId.value = id
    error.value = ''
  }

  async function save(): Promise<void> {
    const config = selected.value
    if (!config) { return }
    const problem = validate(config)
    if (problem) {
      error.value = problem
      return
    }
    saving.value = true
    error.value = ''
    try {
      await window.desktop.iccard.setConfig(config.id, snapshotOverrides(config))
      savedSnapshots.value.set(config.id, JSON.stringify(config))
      showMessage('已保存')
      void refreshStatus()
    }
    catch (err) {
      error.value = describeError(err, '保存失败')
    }
    finally {
      saving.value = false
    }
  }

  /** 保存后重拉设备状态（在位探测结果随之刷新） */
  async function refreshStatus(): Promise<void> {
    try {
      const readers = await window.desktop.iccard.listReaders()
      deviceStatus.value = new Map(readers.map(r => [r.id, r.status]))
    }
    catch {
      deviceStatus.value = new Map()
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
    configs,
    selectedId,
    loading,
    saving,
    message,
    error,
    selected,
    dirty,
    statusOf,
    load,
    select,
    save,
  })
}

/** 档案 → 现场白名单覆盖（名称/ws 地址；清单与技术字段由代码出厂预设锁死） */
function snapshotOverrides(config: IcReaderDeviceConfig): IccardDeviceOverrides {
  return {
    displayName: config.displayName,
    ...(config.transport === 'ws' && config.ws ? { ws: { url: config.ws.url } } : {}),
  }
}

/** 保存前校验：与主进程 sanitize 同规则（必填缺失直接提示，不发无效请求） */
function validate(config: IcReaderDeviceConfig): string | null {
  if (!config.displayName.trim()) { return '设备名称不能为空' }
  if (config.transport === 'ws' && config.ws && !isWsUrl(config.ws.url)) { return '服务地址不合法（须 ws:// 或 wss:// 前缀）' }
  return null
}

function describeError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : String(err)
  return `${fallback}：${message || '未知错误'}`
}
